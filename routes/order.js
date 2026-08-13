const express = require('express');
const router = express.Router();
const Order = require('../models/Order')

const { createOrder, getCurrentOrder, updateCurrentOrder, getTodaysOrder, getOlderOrders, getAllOrders, cancelCurrentOrder, verifyEsewa, updatePayment, getNotPaidOrders, refund, updateOrderItems, getEsewaSignature } = require('../controllers/OrderController');
const { protect } = require('../Utils/Protect');
const { restrictTo } = require('../Utils/RestrictTo');

router.get('/', (req, res) => {
  res.send("This is Order page");
});

router.get('/getallorders', protect, restrictTo('admin'), getAllOrders);

router.post('/createorder', protect, createOrder);

router.post('/esewa-signature', protect, getEsewaSignature);

router.get('/getcurrentorder', protect, getCurrentOrder);

router.get('/gettodaysorders', protect, getTodaysOrder);

router.get('/getolderorders', protect, getOlderOrders);

router.put('/updatecurrentorder', protect, restrictTo('admin'), updateCurrentOrder);

router.put('/updateorderitems', protect, updateOrderItems);

router.put('/cancelorder', protect, cancelCurrentOrder);

router.post('/verifyesewa/:data', verifyEsewa);

router.put('/updatepayment', protect, updatePayment);

router.get('/getnotpaidorders', protect, restrictTo('admin'), getNotPaidOrders);

router.put('/refund', protect, restrictTo('admin'), refund);

module.exports = router;