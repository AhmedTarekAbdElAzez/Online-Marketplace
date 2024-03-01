const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const createToken = require("../utils/createToken");

const User = require("../models/userModel");
const sendEmail = require("../utils/sendEmail");
const { parse } = require("dotenv");

exports.signup = asyncHandler(async (req, res, next) => {
  //Create user
  const user = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
  });

  //Generate token
  const token = createToken(user._id);

  //send response
  res.status(201).json({ data: user, token });
});

exports.login = asyncHandler(async (req, res, next) => {
  //check if password and email in the body (validation)

  //check if user exist & if password is correct
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return next(new ApiError("Incorrect email or password", 401));
  }
  //generate token
  const token = createToken(user._id);

  //send response
  res.status(200).json({ data: user, token });
});

// make sure user is authenticated(logged in)
exports.protect = asyncHandler(async (req, res, next) => {
  // check if token exist & if exist get
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return next(
      new ApiError(
        "You are not login, please login to get access this route.",
        401
      )
    );
  }

  // verify token(no change happen, expired token)
  const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

  // check if user exist
  const currentUser = await User.findById(decoded.userId);
  if (!currentUser)
    return next(new ApiError("token of user doesn't exist", 401));

  // check if user changed password after token created
  if (currentUser.passwordChangedAt) {
    const passChangedTimesTamp = parseInt(
      currentUser.passwordChangedAt.getTime() / 1000,
      10
    );
    //password changed after token created(Error)
    if (passChangedTimesTamp > decoded.iat) {
      return next(
        new ApiError("User recently changed password, please login again", 401)
      );
    }
  }
  req.user = currentUser;
  next();
});

// make sure user is authorized
exports.allowedTo = (...roles) =>
  asyncHandler(async (req, res, next) => {
    // access roles
    // access registered user [req.user.role]
    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError("You do not have permission to access this route", 403)
      );
    }
    next();
  });

exports.forgotPassword = asyncHandler(async (req, res, next) => {
  // Get user by email\
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(
      new ApiError(`This is no user with that email ${req.body.email}`, 404)
    );
  }
  // If user exist, Generate 6 random code
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedResetCode = crypto
    .createHash("sha256")
    .update(resetCode)
    .digest("hex");

  // Save hashed password reset code into db
  user.passwordResetCode = hashedResetCode;
  user.passwordResetExpired = Date.now() * 10 * 60 * 1000;
  user.passwordResetVerified = false;

  user.save();

  // Send reset code via email
  const message = `Hi ${user.name} we received request to reset password on your E-shop Account. \n Code: ${resetCode}\n`;
  try {
    await sendEmail({
      email: user.email,
      subject: "Your password reset code (valid for 10 minutes)",
      message,
    });
  } catch (err) {
    user.passwordResetCode = undefined;
    user.passwordResetExpired = undefined;
    user.passwordResetVerified = undefined;

    await user.save();
    return next(new ApiError("There is an error in sending email", 500));
  }

  // Send Response
  res
    .status(200)
    .json({ status: "success", message: "Reset code was sent successfully" });
});

exports.verifyPassResetCode = asyncHandler(async (req, res, next) => {
  // Get user based on reset code
  const hashedResetCode = crypto
    .createHash("sha256")
    .update(req.body.resetCode)
    .digest("hex");

  const user = await User.findOne({
    passwordResetCode: hashedResetCode,
    passwordResetExpires: { $gt: Date.now() },
  });
  if (!user) {
    return next(new ApiError("Reset code invalid or expired"));
  }

  // Reset code valid
  user.passwordResetVerified = true;
  await user.save();

  res.status(200).json({
    status: "Success",
  });
});

exports.resetPassword = asyncHandler(async (req, res, next) => {
  // Get user based on email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new ApiError(`Reset is no user with email ${req.body.email}`));
  }

  // Check if reset code verified
  if (!user.passwordResetVerified) {
    return next(new ApiError("Reser code not verified", 400));
  }

  // Update password & definitiation & save
  user.password = req.body.newPassword;
  user.passwordResetCode = undefined;
  user.passwordResetExpired = undefined;
  user.passwordResetVerified = undefined;

  await user.save();

  // Generate new token for new password
  const token = createToken(user._id);
  res.status(200).json({ token });
});
