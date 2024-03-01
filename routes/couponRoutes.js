const express = require("express");
const authService = require("../services/authService");

const {
  getCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
} = require("../services/couponService");

const router = express.Router();

router
  .route("/")
  .get(getCoupons)
  .post(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    createCoupon
  );
router
  .route("/:id")
  .get(getCouponValidator, getCoupon)
  .put(
    authService.protect,
    authService.allowedTo("admin", "manager"),
    updateCoupon
  )
  .delete(authService.protect, authService.allowedTo("admin"), deleteCoupon);

module.exports = router;
