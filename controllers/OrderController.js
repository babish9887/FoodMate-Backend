const Order = require("../models/Order");
const User = require("../models/User");
const { SAFE_SELECT } = require('../models/User');
const { decodeBase64 } = require("../Utils/decodeBase64");
const { decryptData } = require("../Utils/decryptData");
exports.createOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(SAFE_SELECT);
    if (!user || !user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your account via email to place an order.",
      });
    }
    const decryptedData = JSON.parse(decryptData(req.body.data));
    if (
      !decryptedData.items ||
      !Array.isArray(decryptedData.items) ||
      decryptedData.items.length > 4
    ) {
      return res.status(400).json({
        success: false,
        message: "You can only have up to 4 different items in your cart.",
      });
    }

    const invalidQuantityItems = decryptedData.items.filter(
      (item) => !item.qty || item.qty > 5
    );
    if (invalidQuantityItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity per item is 5.",
      });
    }

    const currentOrders = await Order.find({
      "statusHistory.4": { $exists: false },
      userId: user._id,
      "currentStatus.status": { $ne: "Cancelled" },
    }).sort({ createdAt: -1 });

    if (currentOrders.length >= 2) {
      return res.status(400).json({
        success: false,
        message:
          "You have 2 active orders. Complete or cancel one to create a new order.",
      });
    }

    const updatedItems = decryptedData.items.map(({ image, ...rest }) => rest);

    let paymentDetails = null;
    if (decryptedData.paymentMethod == "esewa") {
      const data = req.body.esewaData;
      const decryptedEsewaData = decodeBase64(data);
      paymentDetails = {
        transaction_code: decryptedEsewaData.transaction_code,
        status: decryptedEsewaData.status,
        total_amount: decryptedEsewaData.total_amount,
        transaction_uuid: decryptedEsewaData.transaction_uuid,
        product_code: decryptedEsewaData.product_code,
      };
    }

    const orderData = {
      userId: user._id,
      items: updatedItems,
      message: decryptedData.message,
      paymentMethod: decryptedData.paymentMethod,
      currentStatus: { status: "Order Placed", time: Date.now() },
      paymentDetails,
    };

    const newOrder = await Order.create(orderData);
    if (newOrder) {
      return res.status(200).json({
        success: true,
        message: "Order created successfully",
        doc: newOrder,
        // user object intentionally omitted — client already has session context
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

exports.updateCurrentOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.body._id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    let updatedStatusHistory = [
      ...order.statusHistory,
      {
        status: order.currentStatus.status,
        time: order.currentStatus.time,
      },
    ];

    if (req.body.status === "Completed") {
      updatedStatusHistory = [
        ...updatedStatusHistory,
        {
          status: req.body.status,
          time: Date.now(),
        },
      ];
    }

    let updatedOrder = await Order.findByIdAndUpdate(
      order.id,
      {
        currentStatus: {
          status: req.body.status,
          time: Date.now(),
        },
        statusHistory: updatedStatusHistory,
        cancelMessage: req.body.message,
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(400).json({
        success: false,
        message: "Failed to update order!",
      });
    }

    const user = await User.findById(order.userId).select("name email image");

    updatedOrder = {
      ...updatedOrder.toObject(), // Convert Mongoose document to plain object
      user: user || { name: "Unknown", email: "", image: "" },
    };

    res.status(200).json({
      success: true,
      message: "Order status updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.updateOrderItems = async (req, res) => {
  try {
    const order = await Order.findById(req.body._id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    const allowedStatusesForItemUpdate = ["Order Placed", "Order Confirmed"];

    if (!allowedStatusesForItemUpdate.includes(order.currentStatus.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update items when order is in ${order.currentStatus.status} status`,
      });
    }

    // ✅ Quantity validation
    const invalidQuantityItems = req.body.items.filter(
      (item) => !item.qty || item.qty > 5
    );

    if (invalidQuantityItems.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Maximum quantity per item is 5.",
      });
    }

    let updatedOrder = await Order.findByIdAndUpdate(
      order.id,
      {
        items: req.body.items,
        updatedAt: Date.now(),
        isUpdated: true,
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(400).json({
        success: false,
        message: "Failed to update order items!",
      });
    }

    const user = await User.findById(order.userId).select("name email image");

    updatedOrder = {
      ...updatedOrder.toObject(),
      user: user || { name: "Unknown", email: "", image: "" },
    };

    res.status(200).json({
      success: true,
      message: "Order items updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.getCurrentOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: true,
        message: "User Not Found",
      });
    }
    const order = await Order.find({
      "statusHistory.4": { $exists: false },
      userId: user._id,
      "currentStatus.status": { $ne: "Cancelled" },
    }).sort({ createdAt: -1 });

    if (order) {
      return res.status(200).json({
        success: true,
        message: "Got Current Order",
        doc: order,
      });
    }
    return res.status(400).json({
      success: true,
      message: "No Current Order",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.getTodaysOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: true,
        message: "User Not Found",
      });
    }

    const startOfDay = new Date(Date.now());
    startOfDay.setHours(0, 0, 0, 0); // Set to midnight

    const endOfDay = new Date(Date.now());
    endOfDay.setHours(23, 59, 59, 999); // Set to last moment of the day

    const orders = await Order.find({
      "currentStatus.status": { $in: ["Completed", "Cancelled"] },
      userId: user._id,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ createdAt: -1 }); // Sort by creation date in descending order

    if (orders.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Got Today's Orders",
        doc: orders,
      });
    }

    return res.status(400).json({
      success: true,
      message: "No Orders Found for Today",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.getOlderOrders = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: true,
        message: "User Not Found",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0); // Set time to 00:00:00.000 for today

    const orders = await Order.find({
      // "statusHistory.4": { $exists: false },
      userId: user._id,
      createdAt: { $lt: startOfDay }, // Get orders created before the start of today
    }).sort({ createdAt: -1 });

    if (orders.length > 0) {
      return res.status(200).json({
        success: true,
        message: "Got Older Orders",
        doc: orders,
      });
    }

    return res.status(200).json({
      success: true,
      message: "No Older Orders Found",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      return res.status(400).json({
        success: true,
        message: "No Orders Found",
      });
    }

    const ordersWithUserDetails = await Promise.all(
      orders.map(async (order) => {
        const user = await User.findById(order.userId).select(
          "name email image"
        );
        return {
          ...order._doc, // Spread existing order data
          user: user ? user : { name: "Unknown", email: "", image: "" }, // Handle cases where user is missing
        };
      })
    );
    return res.status(200).json({
      success: true,
      message: "Fetched All Orders",
      doc: ordersWithUserDetails,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.cancelCurrentOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.body._id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    let updatedStatusHistory = [
      ...order.statusHistory,
      {
        status: order.currentStatus.status, // Previous status
        time: order.currentStatus.time, // Previous time
      },
    ];

    if (req.body.status === "Completed") {
      updatedStatusHistory = [
        ...updatedStatusHistory,
        {
          status: "Cancelled",
          time: Date.now(),
        },
      ];
    }

    let updatedOrder = await Order.findByIdAndUpdate(
      order.id,
      {
        currentStatus: {
          status: "Cancelled",
          time: Date.now(),
        },
        statusHistory: updatedStatusHistory,
        cancelMessage: req.body.message,
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(400).json({
        success: false,
        message: "Failed to Cancel order!",
      });
    }

    const user = await User.findById(order.userId).select("name email image");

    updatedOrder = {
      ...updatedOrder.toObject(), // Convert Mongoose document to plain object
      user: user || { name: "Unknown", email: "", image: "" },
    };

    res.status(200).json({
      success: true,
      message: "Order status updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.verifyEsewa = async (req, res) => {
  const data = req.params.data;
  const decryptedData = decodeBase64(data);
  res.status(200).json({ success: true, data: decryptedData });
};

exports.updatePayment = async (req, res) => {
  const paymentMethod = req.body.paymentMethod;
  let paymentDetails = null;
  if (paymentMethod == "esewa") {
    const data = req.body.esewaData;
    const decryptedEsewaData = decodeBase64(data);
    paymentDetails = {
      transaction_code: decryptedEsewaData.transaction_code,
      status: decryptedEsewaData.status,
      total_amount: decryptedEsewaData.total_amount,
      transaction_uuid: decryptedEsewaData.transaction_uuid,
      product_code: decryptedEsewaData.product_code,
    };
  }
  let updatedOrder = await Order.findByIdAndUpdate(
    req.body._id,
    {
      paymentMethod: req.body.paymentMethod,
      paymentDetails,
    },
    { new: true }
  );

  if (!updatedOrder) {
    return res.status(400).json({
      success: false,
      message: "Failed to Cancel order!",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Payed Successfully",
  });
};

exports.getNotPaidOrders = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: true,
        message: "User Not Found",
      });
    }
    const order = await Order.find({
      paymentMethod: "Not Paid",
      "currentStatus.status": { $ne: "Cancelled" },
    }).sort({ createdAt: -1 });

    if (order) {
      return res.status(200).json({
        success: true,
        message: "Got Unpaid Order",
        doc: order,
      });
    }
    return res.status(400).json({
      success: true,
      message: "No Unpaid Order",
    });
  } catch (err) {
    console.log(err);
    res.status(400).json({
      success: false,
      message: "Internal Server Error!",
    });
  }
};

exports.refund = async (req, res) => {
  let updatedOrder = await Order.findByIdAndUpdate(
    req.body._id,
    {
      paymentDetails: {
        status: "FULL_REFUND",
      },
    },
    { new: true }
  );

  if (!updatedOrder) {
    return res.status(400).json({
      success: false,
      message: "Failed Refund!",
    });
  }

  return res.status(200).json({
    success: true,
    message: "Refund Successfully",
  });
};
