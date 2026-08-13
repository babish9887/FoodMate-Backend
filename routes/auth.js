const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../Utils/Protect');
const { restrictTo } = require('../Utils/RestrictTo');
const { createRateLimiter } = require('../Utils/RateLimiter');
const { signup, login, verifyemail, sendPasswordResetLink, resetPassword, adminLogin, googleSignUp, logout, adminLogout, getMe } = require('../controllers/AuthController');
const { getAll, deleteOne, updateOne } = require('../controllers/handlerFactory');

const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 15 });

router.get('/', (req, res) => {
  res.send("This is auth page");
});

router.post('/verifyemail', verifyemail);

router.post('/signup', authLimiter, signup);
router.post('/googlesignup', authLimiter, googleSignUp);

router.post('/login', authLimiter, login);
router.post('/adminlogin', authLimiter, adminLogin);

router.get('/getcustomers', protect, restrictTo('admin'), getAll(User));
router.delete('/deletecustomer/:id', protect, restrictTo('admin'), deleteOne(User));
router.put('/updatecustomer/:id', protect, restrictTo('admin'), updateOne(User));

router.post('/sendpasswordresetlink', authLimiter, sendPasswordResetLink);
router.post('/resetpassword', resetPassword);

router.post('/logout', logout);
router.post('/adminlogout', adminLogout);
router.get('/me', protect, getMe);

router.get('/getUsers', protect, restrictTo('admin'), async (req, res) => {
  try {
    let users = await User.find();
    return res.json({ success: true, users });
  } catch (e) {
    return res.json({ success: false, message: e.message });
  }
});

router.get('/getcustomer/:id', protect, restrictTo('admin'), async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({ success: true, user });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;