const User = require("../models/User");
const bc = require("bcryptjs");
const sendEmail = require("../Utils/Mailer");
const { generateVerificationToken } = require("../Utils/VerificationToken");
const { signToken } = require('../Utils/SignToken');

// Helper: set an HttpOnly cookie on the response
const setCookieForRes = (res, name, token) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(name, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'None' : 'Lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
};
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

const verifyGoogleIdToken = async (idToken) => {
  if (!idToken) return null;
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) return null;
    const data = await res.json();

    const expectedAudience = process.env.GOOGLE_CLIENT_ID;
    if (data.aud !== expectedAudience && data.azp !== expectedAudience) {
      console.error('Google ID token audience mismatch:', data.aud);
      return null;
    }

    if (data.email_verified !== 'true' && data.email_verified !== true) {
      console.error('Google email is not verified:', data.email_verified);
      return null;
    }

    return {
      email: data.email,
      name: data.name || data.given_name || 'Google User',
      picture: data.picture || '',
    };
  } catch (err) {
    console.error('Error verifying Google Token:', err);
    return null;
  }
};

exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email });
    if (user && user.role === 'admin') {
      const passcmp = await bc.compare(password, user.password);
      if (passcmp) {
        const token = signToken({ id: user._id });
        setCookieForRes(res, 'adminjwt', token);
        return res.status(200).json({
          success: true,
          message: "Signed In successfully",
          user: safeUser(user),
        });
      }
    }
    return res.status(400).json({
      success: false,
      message: "Invalid Credentials",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


exports.signup = async (req, res) => {
  try {
    const { name, email, password, picture } = req.body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || typeof email !== 'string' || !emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address.",
      });
    }

    if (password && (typeof password !== 'string' || password.length < 6)) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    const oldUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (oldUser) {
      return res.status(400).json({
        success: false,
        message: "User with email already exists",
      });
    }

    let newUser = null;
    if (password) {
      const salt = await bc.genSalt(10);
      const pass = await bc.hash(password, salt);
      const verifyToken = generateVerificationToken();

      newUser = await User.create({
        name: name ? String(name).trim() : 'User',
        email: email.toLowerCase().trim(),
        picture: picture || '',
        password: pass,
        isVerified: false,
        verifyToken,
        verifyTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const siteUrl = process.env.SITE_URL || process.env.URL || 'http://localhost:5173';
      const link = `${siteUrl.replace(/\/+$/, '')}/verifyemail/?id=${newUser._id}&token=${verifyToken}`;
      try {
        await sendEmail({ email: newUser.email, type: 'signup', link, userName: newUser.name, subject: 'Welcome to FoodMate!' });
      } catch (eErr) {
        console.error("Verification email failed:", eErr);
      }
    } else {
      newUser = await User.create({
        name: name ? String(name).trim() : 'User',
        email: email.toLowerCase().trim(),
        picture: picture || '',
        isVerified: true
      });
    }

    if (newUser) {
      return res.status(200).json({
        success: true,
        message: "Account created successfully",
        user: safeUser(newUser),
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


exports.googleSignUp = async (req, res) => {
  try {
    const idToken = req.body.idToken || req.body.credential;
    let verifiedPayload = null;

    if (idToken) {
      verifiedPayload = await verifyGoogleIdToken(idToken);
    }

    // Fallback error if token missing or invalid
    if (!verifiedPayload) {
      return res.status(401).json({
        success: false,
        message: "Invalid or unverified Google token. Please try again.",
      });
    }

    const { email, name, picture } = verifiedPayload;

    const oldUser = await User.findOne({ email });
    if (oldUser) {
      if (!oldUser.isActive) {
        return res.status(401).json({
          success: false,
          message: "You are blocked by the admin, Please Contact to admin!",
        });
      }
      const token = signToken({ id: oldUser._id, name: oldUser.name, email: oldUser.email, picture: oldUser.picture });
      setCookieForRes(res, 'foodmateuser', token);
      return res.status(200).json({
        success: true,
        message: "Account SignedIn Successfully",
        user: safeUser(oldUser),
      });
    }

    const newUser = await User.create({ name, email, picture, isVerified: true });

    if (newUser) {
      const token = signToken({ id: newUser._id, name: newUser.name, email: newUser.email, picture: newUser.picture });
      setCookieForRes(res, 'foodmateuser', token);
      return res.status(200).json({
        success: true,
        message: "Account SignedUp successfully",
        user: safeUser(newUser),
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (user && user.password) {
      if (!user.isActive)
        return res.status(401).json({
          success: false,
          message: "You are blocked by the admin Please Contact to admin!",
        });

      const passcmp = await bc.compare(password, user.password);
      if (passcmp) {
        const token = signToken({ id: user._id, name: user.name, email: user.email });
        setCookieForRes(res, 'foodmateuser', token);
        return res.status(200).json({
          success: true,
          message: "Signed In successfully",
          user: safeUser(user),
        });
      }
    }
    return res.status(400).json({
      success: false,
      message: "Invalid Credentials",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.sendPasswordResetLink = async (req, res) => {
  try {
    const genericResponse = {
      success: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    };

    const { email } = req.body;
    if (!email) return res.status(200).json(genericResponse);

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) {
      return res.status(200).json(genericResponse);
    }

    const forgotPasswordToken = generateVerificationToken();

    await User.findByIdAndUpdate(user._id, {
      forgotPasswordToken,
      forgotPasswordExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
    }, { new: true });

    const siteUrl = process.env.URL || process.env.SITE_URL || 'http://localhost:5173';
    const link = `${siteUrl.replace(/\/+$/, '')}/resetpassword/?id=${user._id}&token=${forgotPasswordToken}`;

    try {
      await sendEmail({
        email: user.email,
        link,
        userName: user.name,
        subject: 'Reset Your Password',
        type: 'resetpassword'
      });
    } catch (sendErr) {
      console.error("Error sending reset password email:", sendErr);
    }

    return res.status(200).json(genericResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

      if (!req.body.password || req.body.password.length < 6) {
        return res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters long.",
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
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('foodmateuser', { path: '/' });
  return res.status(200).json({ success: true, message: 'Logged out successfully' });
};

exports.adminLogout = (req, res) => {
  res.clearCookie('adminjwt', { path: '/' });
  return res.status(200).json({ success: true, message: 'Admin logged out successfully' });
};

exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }
    return res.status(200).json({ success: true, user: safeUser(req.user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};