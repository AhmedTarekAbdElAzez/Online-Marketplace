const express = require("express");
const authService = require("../services/authService");

const {
  createCashOrder,
  findAllOrders,
  findSpecificOrder,
  updateOrderToDelivered,
  updateOrderToPaid,
  checkoutSession,
} = require("../services/orderService");

const router = express.Router();

router.use(authService.protect);

router.get(
  "/checkout-session/:cartId",
  authService.allowedTo("user"),
  checkoutSession
);

router.route("/:cartId").post(authService.allowedTo("user"), createCashOrder);
router.get("/", authService.allowedTo("admin", "manager"), findAllOrders);
router.get("/:id", findSpecificOrder);
router.put(
  "/:id/pay",
  authService.allowedTo("admin", "manager"),
  updateOrderToPaid
);
router.put(
  "/:id/deliver",
  authService.allowedTo("admin", "manager"),
  updateOrderToDelivered
);
module.exports = router;
