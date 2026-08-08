const mongoose = require("mongoose");

const SAFE_SELECT = '-password -verifyToken -verifyTokenExpiry -forgotPasswordToken -forgotPasswordExpiry -__v';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
    required: true,
  },
  picture: {
    type: String,
    required: false,
  },
  password: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
    immutable: true,
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVerified: {
    type: Boolean,
    required: false,
    default: false,
  },
  verifyToken: {
    type: String,
    required: false,
  },
  verifyTokenExpiry: {
    type: Date,
    required: false,
  },
  forgotPasswordToken: {
    type: String,
    required: false,
  },
  forgotPasswordExpiry: {
    type: Date,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  toJSON: {
    transform(doc, ret) {
      delete ret.password;
      delete ret.verifyToken;
      delete ret.verifyTokenExpiry;
      delete ret.forgotPasswordToken;
      delete ret.forgotPasswordExpiry;
      delete ret.__v;
      return ret;
    }
  }
});


userSchema.pre("save", function (next) {
  if (this.isNew) {
    this.role = 'user';
  } else if (this.isModified('role')) {
    return next(new Error('SECURITY: role field cannot be changed after account creation'));
  }
  this.updatedAt = Date.now();
  next();
});

const User = mongoose.model("User", userSchema);
module.exports = User;
module.exports.SAFE_SELECT = SAFE_SELECT;

