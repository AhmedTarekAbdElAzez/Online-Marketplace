const express = require("express");
const authService = require("../services/authService");

const {
  getReviewValidator,
  createReviewValidator,
  updateReviewValidator,
  deleteReviewValidator,
} = require("../utils/validator/reviewValidator");

const {
  getReviews,
  getReview,
  createReview,
  updateReview,
  deleteReview,
  createFilterObj,
  setProductIdToBody,
} = require("../services/reviewService");

const router = express.Router({ mergeParams: true });

router
  .route("/")
  .get(createFilterObj, getReviews)
  .post(
    authService.protect,
    authService.allowedTo("user"),
    setProductIdToBody,
    createReviewValidator,
    createReview
  );
router
  .route("/:id")
  .get(getReview)
  .put(authService.protect, authService.allowedTo("user"), updateReview)
  .delete(
    authService.protect,
    authService.allowedTo("admin", "manager", "user"),
    getReviewValidator,
    updateReviewValidator,
    deleteReviewValidator,
    deleteReview
  );

module.exports = router;
