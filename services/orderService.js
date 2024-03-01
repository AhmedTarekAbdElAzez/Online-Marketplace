const stripe = require("stripe")("process.env.STRIPE_SECRET");
const asyncHandler = require("express-async-handler");
const factory = require("./handlersFactory");
const ApiError = require("../utils/apiError");

const Order = require("../models/orderModel");
const Cart = require("../models/cartModel");
const Product = require("../models/productModel");
const { TokenExpiredError } = require("jsonwebtoken");
const { request } = require("express");
const User = require("../models/userModel");

// @desc    Create cash order
// @route   POST  /api/v1/orders/cartId
// @access  Protected/User
exports.createCashOrder = asyncHandler(async (req, res, next) => {
  // App settings
  const taxPrice = 0; // req.params.tax
  const shippingPrice = 0; // req.params.tax

  // 1)Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2)Get order price depend on cart price, "check if coupon applied"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalPrice;
  const totalOrderPrice = cartPrice + taxPrice + shippingPrice;

  // 3)Create order with default payment method(cash)
  const order = await Order.create({
    user: req.user._id,
    cartItems: cart.cartItems,
    totalOrderPrice,
    shippingAddress: req.body.shippingAddress,
  });

  // 4)After creating order decrement product quantity, increment product sold
  //bulk: do more one operation in one command
  if (order) {
    const bulkOption = cart.cartItems.map((item) => {
      updateOne: {
        filter: {
          _id: item.product;
        }
        update: {
          $inc: {
            {
              quantity: -item.quantity;
              sold: +item.quantity;
            }
          }
        }
      }
    });
    await Product.bulkWrite(bulkOption, {});

    // 5)Clear cart depend on cartId
    await Cart.findByIdAndDelete(req.params.cartId);

    res.status(201).json({ status: "success", data: order });
  }
});

exports.filterOrderForLoggedUser = asyncHandler(async (req, res, next) => {
  if (req.user.role === "user") {
    req.filterObj = { user: req.user._id };
  }
});
// @desc    Get all orders
// @route   POST  /api/v1/orders
// @access  Protected/User-Admin-Manager
exports.findAllOrders = factory.getAll(Order);

// @desc    Get specific order
// @route   POST  /api/v1/orders/:id
// @access  Protected/User-Admin-Manager
exports.findSpecificOrder = factory.getOne(Order);

// @desc    Update order paid status to paid
// @route   POST  /api/v1/orders/:id
// @access  Protected/User-Admin-Manager
exports.updateOrderToPaid = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params._id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such an order with this id ${req.params.id}`,
        404
      )
    );
  }

  // Update order paid status to paid
  order.isPaid = true;
  order.paidAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: "success", data: updatedOrder });
});

// @desc    Update order deliviered status to delivered
// @route   POST  /api/v1/orders/:id/delver
// @access  Protected/User-Admin-Manager
exports.updateOrderToDelivered = asyncHandler(async (req, res, next) => {
  const order = await Order.findById(req.params._id);
  if (!order) {
    return next(
      new ApiError(
        `There is no such an order with this id ${req.params.id}`,
        404
      )
    );
  }

  // Update order deliver status to delivered
  order.isDelivered = true;
  order.deliveredAt = Date.now();

  const updatedOrder = await order.save();

  res.status(200).json({ status: "success", data: updatedOrder });
});

// @desc    Get checkout session from stripe and send it as a response
// @route   POST  /api/v1/orders/checkout-session/cartId
// @access  Protected/User
exports.checkoutSession = asyncHandler(async (req, res, next) => {
  // App settings
  const taxPrice = 0; // req.params.tax
  const shippingPrice = 0; // req.params.tax

  // 1)Get cart depend on cartId
  const cart = await Cart.findById(req.params.cartId);
  if (!cart) {
    return next(
      new ApiError(`There is no such cart with id ${req.params.cartId}`, 404)
    );
  }

  // 2)Get order price depend on cart price, "check if coupon applied"
  const cartPrice = cart.totalPriceAfterDiscount
    ? cart.totalPriceAfterDiscount
    : cart.totalPrice;
  const totalOrderPrice = cartPrice + taxPrice + shippingPrice;

  // 3)Create stripe checkout  session
  const session = await stripe.checkout.create({
    line_items: [
      {
        name: req.user.name,
        amount: totalOrderPrice * 100,
        currency: "egp",
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${req.protocol}://${req.get("host")}/orders`,
    cancel_url: `${req.protocol}://${req.get("host")}/cart`,
    customer_email: req.user.email,
    client_reference_id: cart._id,
    metadata: req.body.shippingAddress,
  });

  // 4)Send session to response
  res.status(200).json({ status: "success", data: session });
});

// on production not development environment
const createCardOrder = async (session) => {
  const cartId = session.client_reference_id;
  const shippingAddress = session.metadata;
  const orderPrice = session.display_items[0].amount;

  const cart = await Cart.findById(cartId);
  const user = await User.findOne({ email: session.customer_email });

  // Create order with default paymentMethodType card
  const order = await Order.create({
    user: user._id,
    cartItems: cart.cartItems,
    totalOrderPrice: orderPrice,
    shippingAddress,
    isPaid: true,
    paidAt: Date.now(),
  });
  // 4)After creating order decrement product quantity, increment product sold
  if (order) {
    const bulkOption = cart.cartItems.map((item) => {
      updateOne: {
        filter: {
          _id: item.product;
        }
        update: {
          $inc: {
            {
              quantity: -item.quantity;
              sold: +item.quantity;
            }
          }
        }
      }
    });
  }
  await Product.bulkWrite(bulkOption, {});

  // 5)Clear cart depend on cartId
  await Cart.findById(cartId);
};

// @desc    This webhock will run when stripe payment success paid
// @route   POST  /webhock-checkout
// @access  Protected/User
exports.webhockCheckout = asyncHandler(async (req, res, next) => {
  const sig = req.headers["stripe_signature"];

  let event;

  try {
    event = stripe.webhocks.constructEvent(
      req.body,
      sig,
      process.env.STRIOE_WEBHOCK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhock Error: ${err.message}`);
  }
  if (event.type === "checkout.session.completed") {
    console.log("Create order here...");
  }

  res.status(200).json({ received: true });
});
