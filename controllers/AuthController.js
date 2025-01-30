// import User from "../models/User";
const User = require("../models/User");
const bc = require("bcryptjs");
const sendEmail = require("../Utils/Mailer");
const { generateVerificationToken } = require("../Utils/VerificationToken");
const { getJSDocReturnType } = require("typescript");
exports.signup = async (req, res) => {
  try {
    const oldUser = await User.findOne({ email: req.body.email });
    if (oldUser)
      return res.status(400).json({
        success: false,
        message: "User with email already exists",
      });

    let newUser = null;
    if (req.body.password) {
      const salt = await bc.genSalt(10);
      const pass = await bc.hash(req.body.password, salt);

      const verifyToken = generateVerificationToken()

      newUser = await User.create({
        ...req.body,
        password: pass,
        isVerified: false,
        verifyToken,
        verifyTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });


      const link = `${process.env.URL}/verifyemail/?id=${newUser._id}&token=${verifyToken}`
      await sendEmail({ email: newUser.email, type:'signup', link, userName: newUser.name, subject: 'Welcome to FoodMate!' })


    } else newUser = await User.create({ ...req.body, isVerified: true });

    if (newUser) {
      return res.status(200).json({
        success: true,
        message: "Account created successfully",
        user: newUser,
      });
    }

  } catch (err) {
    console.log(err)
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
      const passcmp = bc.compare(req.body.password, user.password);
      if (passcmp)
        return res.status(200).json({
          success: true,
          message: "Signed In successfully",
          user: user,
        });

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

    const user = await User.findById(req.body.id)
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
      }, { new: true })

      if (updatedUser) {
        return res.status(200).json({
          success: true,
          message: "Email Verified successfully",
          user: user,
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
}

exports.sendPasswordResetLink = async (req, res) => {
  console.log(req.body.email)
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      res.status(400).json({
        success: false,
        message: "User With that email doesn't Exists",
      });
    }

    const forgotPasswordToken = generateVerificationToken();

    const updatedUser = await User.findByIdAndUpdate(user._id, {
      forgotPasswordToken,
      forgotPasswordExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }, { new: true })


    const link = `${process.env.URL}/resetpassword/?id=${user._id}&token=${forgotPasswordToken}`
    const emailresponse=await sendEmail({ email: user.email, link, 
      userName: user.name, 
      subject: 'Reset Your Password' ,
      type:'resetpassword'
    })
    console.log(emailresponse)
    if(emailresponse.accepted.length!=0)
      return res.status(400).json({
        success: true,
        message: "Password Reset Email Link Sent Successfully",
      });

    return res.status(400).json({
      success: false,
      message: "Failed to Send Password Reset Link",
    });
  } catch (err) {
    console.log(err)
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};


exports.resetPassword = async (req, res) => {
  try {

    const user = await User.findById(req.body.id)
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
        password:hashedPassword,
        forgotPasswordToken: null,
        forgotPasswordExpiry: null
      }, { new: true })

      if (updatedUser) {
        return res.status(200).json({
          success: true,
          message: "Password Reset successfully",
          user: user,
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
}