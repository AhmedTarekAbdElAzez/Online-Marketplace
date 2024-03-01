const mongoose = require("mongoose");
const Product = require("./productModel");
const reviewSchema = new mongoose.Schema(
  {
    title: {
      type: "string",
    },
    ratings: {
      type: Number,
      min: [1, "Min rating is 1.0"],
      max: [5, "Max rating is 5.0"],
      required: [true, "review rating is required"],
    },
    User: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
      required: [true, "Review must belong to user"],
    },
    product: {
      type: mongoose.Schema.ObjectId,
      ref: "Product",
      required: [true, "Review must belong to product"],
    },
  },
  {
    timestamps: true,
    // To enable virtual populate
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

reviewSchema.pre(/^find/, function (next) {
  this.populate({ path: "user", select: "name" });
  next();
});

reviewSchema.statics.calcAverageRatingAndQuantity = async function (productId) {
  const result = await this.aggregate([
    // Get all reviews in specific product
    { $match: { product: productId } },
    // Grouping reviews based on productId and calculate average rating, quantity
    {
      $group: {
        _id: "product",
        avgRatings: { $avg: "ratings" },
        ratingsQuantity: { $sum: 1 },
      },
    },
  ]);
  if (result > 0) {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: result[0].avgRatings,
      ratingsQuantity: result[0].ratingsQuantity,
    });
  } else {
    await Product.findByIdAndUpdate(productId, {
      ratingsAverage: 0,
      ratingsQuantity: 0,
    });
  }
};

reviewSchema.post("save", async function () {
  await this.constructor.calcAverageRatingAndQuantity(this.product);
});

module.exports = mongoose.model("Review", reviewSchema);
