const User = require("../models/User");
const bc = require("bcryptjs");
const sendEmail = require("../Utils/Mailer");
const { generateVerificationToken } = require("../Utils/VerificationToken");
const { signToken } = require('../Utils/SignToken');

const safeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.password;
  delete obj.verifyToken;
  delete obj.verifyTokenExpiry;
  delete obj.forgotPasswordToken;
  delete obj.forgotPasswordExpiry;
  delete obj.__v;
  return obj;
};


exports.adminLogin = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (user && user.role === 'admin') {
      const passcmp = await bc.compare(req.body.password, user.password);
      if (passcmp) {
        const token = signToken({ id: user._id });
        return res.status(200).json({
          success: true,
          token,
          message: "Signed In successfully",
          user: safeUser(user),
        });
      }
    }
    res.status(400).json({
      success: false,
      message: "Invalid Credentials",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};


exports.signup = async (req, res) => {
  try {
    const oldUser = await User.findOne({ email: req.body.email });
    if (oldUser)
      return res.status(400).json({
        success: false,
        message: "User with email already exists",
      });

    const { name, email, password, picture } = req.body;

    let newUser = null;
    if (password) {
      const salt = await bc.genSalt(10);
      const pass = await bc.hash(password, salt);

      const verifyToken = generateVerificationToken();

      newUser = await User.create({
        name,
        email,
        picture,
        password: pass,
        isVerified: false,
        verifyToken,
        verifyTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const link = `${process.env.SITE_URL}/verifyemail/?id=${newUser._id}&token=${verifyToken}`;
      await sendEmail({ email: newUser.email, type: 'signup', link, userName: newUser.name, subject: 'Welcome to FoodMate!' });

    } else {
      newUser = await User.create({ name, email, picture, isVerified: true });
    }

    if (newUser) {
      return res.status(200).json({
        success: true,
        message: "Account created successfully",
        user: safeUser(newUser),
      });
    }

  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};


exports.googleSignUp = async (req, res) => {
  try {
    const oldUser = await User.findOne({ email: req.body.email });
    if (oldUser) {
      if (!oldUser.isActive) {
        return res.status(401).json({
          success: false,
          message: "You are blocked by the admin, Please Contact to admin!",
        });
      }
      const token = signToken({ id: oldUser._id, name: oldUser.name, email: oldUser.email, picture: oldUser.picture });

      return res.status(200).json({
        success: true,
        token,
        message: "Account SignedIn Successfully",
        user: safeUser(oldUser),
      });
    }

    const { name, email, picture } = req.body;
    const newUser = await User.create({ name, email, picture, isVerified: true });

    if (newUser) {
      const token = signToken({ id: newUser._id, name: newUser.name, email: newUser.email, picture: newUser.picture });

      return res.status(200).json({
        success: true,
        token,
        message: "Account SignedUp successfully",
        user: safeUser(newUser),
      });
    }

  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};


exports.login = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (user) {
      if (!user.isActive)
        return res.status(401).json({
          success: false,
          message: "You are blocked by the admin Please Contact to admin!",
        });
      const passcmp = await bc.compare(req.body.password, user.password);
      if (passcmp) {
        const token = signToken({ id: user._id, name: user.name, email: user.email });
        return res.status(200).json({
          success: true,
          token,
          message: "Signed In successfully",
          user: safeUser(user),
        });
      }
    }
    res.status(400).json({
      success: false,
      message: "Invalid Credentials",
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.verifyemail = async (req, res) => {
  try {
    const user = await User.findById(req.body.id);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User does not exists",
      });
    }

    if (user.verifyToken === req.body.verifyToken) {
      if (user.verifyTokenExpiry < new Date()) {
        return res.status(400).json({
          success: false,
          message: "Token is Expired",
        });
      }
      const updatedUser = await User.findByIdAndUpdate(req.body.id, {
        isVerified: true,
        verifyToken: null,
        verifyTokenExpiry: null
      }, { new: true });

      if (updatedUser) {
        return res.status(200).json({
          success: true,
          message: "Email Verified successfully",
          user: safeUser(updatedUser),
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: "Invalid Token",
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.sendPasswordResetLink = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User With that email doesn't Exists",
      });
    }

    const forgotPasswordToken = generateVerificationToken();

    await User.findByIdAndUpdate(user._id, {
      forgotPasswordToken,
      forgotPasswordExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }, { new: true });

    const link = `${process.env.URL}/resetpassword/?id=${user._id}&token=${forgotPasswordToken}`;
    const emailresponse = await sendEmail({
      email: user.email,
      link,
      userName: user.name,
      subject: 'Reset Your Password',
      type: 'resetpassword'
    });

    if (emailresponse.accepted.length !== 0)
      return res.status(200).json({
        success: true,
        message: "Password Reset Email Link Sent Successfully",
      });

    return res.status(400).json({
      success: false,
      message: "Failed to Send Password Reset Link",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};


exports.resetPassword = async (req, res) => {
  try {
    const user = await User.findById(req.body.id);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User does not exists",
      });
    }

    if (user.forgotPasswordToken === req.body.forgotPasswordToken) {
      if (user.forgotPasswordExpiry < new Date()) {
        return res.status(400).json({
          success: false,
          message: "Token is Expired",
        });
      }
      const salt = await bc.genSalt(10);
      const hashedPassword = await bc.hash(req.body.password, salt);

      const updatedUser = await User.findByIdAndUpdate(req.body.id, {
        password: hashedPassword,
        forgotPasswordToken: null,
        forgotPasswordExpiry: null
      }, { new: true });

      if (updatedUser) {
        return res.status(200).json({
          success: true,
          message: "Password Reset successfully",
        });
      }
    }

    return res.status(400).json({
      success: false,
      message: "Invalid Token",
    });

  } catch (err) {
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};