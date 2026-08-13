const Order = require("../models/Order");
const User = require("../models/User");
const Food = require("../models/Food");
const { SAFE_SELECT } = require('../models/User');
const { decodeBase64 } = require("../Utils/decodeBase64");
const { decryptData } = require("../Utils/decryptData");
const { verifyEsewaSignature, generateEsewaSignature } = require("../Utils/Esewa");

/**
 * Recompute item prices from database records to prevent client-side price tampering
 */
async function recomputeAndValidateItems(rawItems) {
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 4) {
    throw new Error("You can only have 1 to 4 items in your order.");
  }

  const sanitizedItems = [];
  for (const item of rawItems) {
    const qty = Number(item.qty);
    if (!qty || qty < 1 || qty > 5) {
      throw new Error("Maximum quantity per item is 5.");
    }

    let foodDoc = null;
    if (item.itemId) {
      foodDoc = await Food.findById(item.itemId);
    }
    if (!foodDoc && item.name) {
      foodDoc = await Food.findOne({ name: item.name });
    }

    if (!foodDoc || !foodDoc.available) {
      throw new Error(`Item '${item.name || 'Selected food'}' is unavailable.`);
    }

    let itemPrice = 0;
    if (foodDoc.sizes && foodDoc.sizes.length > 0) {
      const matchedSize = foodDoc.sizes.find((s) => s.name === item.size);
      if (matchedSize) {
        itemPrice = matchedSize.price;
      } else {
        itemPrice = foodDoc.sizes[0].price;
      }
    }

    if (itemPrice < 0) {
      throw new Error("Invalid item price.");
    }

    sanitizedItems.push({
      itemId: foodDoc._id.toString(),
      name: foodDoc.name,
      category: foodDoc.category || item.category || "",
      price: itemPrice,
      qty,
      size: item.size || (foodDoc.sizes && foodDoc.sizes[0] ? foodDoc.sizes[0].name : "Standard"),
    });
  }

  return sanitizedItems;
}

exports.getEsewaSignature = async (req, res) => {
  try {
    const { total_amount, transaction_uuid } = req.body;
    if (!total_amount || !transaction_uuid) {
      return res.status(400).json({ success: false, message: "Missing payment amount or transaction UUID" });
    }

    const product_code = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
    const signature = generateEsewaSignature({
      total_amount: String(total_amount),
      transaction_uuid: String(transaction_uuid),
      product_code,
    });

    return res.status(200).json({
      success: true,
      signature,
      product_code,
    });
  } catch (err) {
    console.error("Error generating eSewa signature:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(SAFE_SELECT);
    if (!user || !user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Please verify your account via email to place an order.",
      });
    }

    let orderPayload = req.body;
    if (req.body.data && typeof req.body.data === 'string') {
      try {
        orderPayload = JSON.parse(decryptData(req.body.data));
      } catch (e) {
        orderPayload = req.body;
      }
    }

    let updatedItems;
    try {
      updatedItems = await recomputeAndValidateItems(orderPayload.items);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: valErr.message,
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
        message: "You have 2 active orders. Complete or cancel one to create a new order.",
      });
    }

    let paymentDetails = null;
    if (orderPayload.paymentMethod === "esewa" && req.body.esewaData) {
      const decryptedEsewaData = decodeBase64(req.body.esewaData);
      if (decryptedEsewaData && verifyEsewaSignature(decryptedEsewaData)) {
        paymentDetails = {
          transaction_code: decryptedEsewaData.transaction_code,
          status: decryptedEsewaData.status || "COMPLETE",
          total_amount: decryptedEsewaData.total_amount,
          transaction_uuid: decryptedEsewaData.transaction_uuid,
          product_code: decryptedEsewaData.product_code,
        };
      } else {
        return res.status(400).json({
          success: false,
          message: "eSewa payment verification failed.",
        });
      }
    }

    const orderData = {
      userId: user._id,
      items: updatedItems,
      message: orderPayload.message || "",
      paymentMethod: orderPayload.paymentMethod || "Not Paid",
      currentStatus: { status: "Order Placed", time: Date.now() },
      paymentDetails,
    };

    const newOrder = await Order.create(orderData);
    if (newOrder) {
      return res.status(200).json({
        success: true,
        message: "Order created successfully",
        doc: newOrder,
      });
    }
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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
      ...updatedOrder.toObject(),
      user: user || { name: "Unknown", email: "", image: "" },
    };

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Update current order error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

    // IDOR Check: Ensure ordering user owns the order
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to modify this order.",
      });
    }

    const allowedStatusesForItemUpdate = ["Order Placed", "Order Confirmed"];

    if (!allowedStatusesForItemUpdate.includes(order.currentStatus.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update items when order is in ${order.currentStatus.status} status`,
      });
    }

    let updatedItems;
    try {
      updatedItems = await recomputeAndValidateItems(req.body.items);
    } catch (valErr) {
      return res.status(400).json({
        success: false,
        message: valErr.message,
      });
    }

    let updatedOrder = await Order.findByIdAndUpdate(
      order.id,
      {
        items: updatedItems,
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

    return res.status(200).json({
      success: true,
      message: "Order items updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.error("Update order items error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getCurrentOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Not Found",
      });
    }
    const order = await Order.find({
      "statusHistory.4": { $exists: false },
      userId: user._id,
      "currentStatus.status": { $ne: "Cancelled" },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: order.length > 0 ? "Got Current Order" : "No Current Order",
      doc: order,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getTodaysOrder = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Not Found",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      "currentStatus.status": { $in: ["Completed", "Cancelled"] },
      userId: user._id,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: orders.length > 0 ? "Got Today's Orders" : "No Orders Found for Today",
      doc: orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getOlderOrders = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Not Found",
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      userId: user._id,
      createdAt: { $lt: startOfDay },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: orders.length > 0 ? "Got Older Orders" : "No Older Orders Found",
      doc: orders,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });

    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No Orders Found",
        doc: [],
      });
    }

    const ordersWithUserDetails = await Promise.all(
      orders.map(async (order) => {
        const user = await User.findById(order.userId).select(
          "name email image"
        );
        return {
          ...order._doc,
          user: user ? user : { name: "Unknown", email: "", image: "" },
        };
      })
    );
    return res.status(200).json({
      success: true,
      message: "Fetched All Orders",
      doc: ordersWithUserDetails,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
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

    // IDOR check: Verify user ownership or admin role
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to cancel this order.",
      });
    }

    let updatedStatusHistory = [
      ...order.statusHistory,
      {
        status: order.currentStatus.status,
        time: order.currentStatus.time,
      },
    ];

    let updatedOrder = await Order.findByIdAndUpdate(
      order.id,
      {
        currentStatus: {
          status: "Cancelled",
          time: Date.now(),
        },
        statusHistory: updatedStatusHistory,
        cancelMessage: req.body.message || "Cancelled by user",
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
      ...updatedOrder.toObject(),
      user: user || { name: "Unknown", email: "", image: "" },
    };

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully!",
      order: updatedOrder,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.verifyEsewa = async (req, res) => {
  const data = req.params.data;
  const decryptedData = decodeBase64(data);
  const isValid = verifyEsewaSignature(decryptedData);
  return res.status(200).json({ success: isValid, data: decryptedData });
};

exports.updatePayment = async (req, res) => {
  try {
    const order = await Order.findById(req.body._id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found!",
      });
    }

    // IDOR check: Verify user ownership or admin role
    if (order.userId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to update payment for this order.",
      });
    }

    const paymentMethod = req.body.paymentMethod;
    let paymentDetails = null;

    if (paymentMethod === "esewa") {
      const data = req.body.esewaData;
      if (!data) {
        return res.status(400).json({
          success: false,
          message: "Missing eSewa payment proof data.",
        });
      }

      const decryptedEsewaData = decodeBase64(data);
      const isSignatureValid = verifyEsewaSignature(decryptedEsewaData);

      if (!isSignatureValid || (decryptedEsewaData.status !== "COMPLETE" && decryptedEsewaData.status !== "SUCCESS")) {
        return res.status(400).json({
          success: false,
          message: "Invalid eSewa payment signature or status not complete.",
        });
      }

      paymentDetails = {
        transaction_code: decryptedEsewaData.transaction_code,
        status: decryptedEsewaData.status || "COMPLETE",
        total_amount: decryptedEsewaData.total_amount,
        transaction_uuid: decryptedEsewaData.transaction_uuid,
        product_code: decryptedEsewaData.product_code,
      };
    } else if (paymentMethod === "cash") {
      paymentDetails = {
        status: req.user.role === 'admin' ? "PAID_CASH" : "PENDING_CASH",
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
        message: "Failed to update payment status!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment status updated successfully",
    });
  } catch (err) {
    console.error("Update payment error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getNotPaidOrders = async (req, res) => {
  try {
    const order = await Order.find({
      $or: [{ paymentMethod: "Not Paid" }, { "paymentDetails.status": "PENDING_CASH" }],
      "currentStatus.status": { $ne: "Cancelled" },
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: order.length > 0 ? "Got Unpaid Orders" : "No Unpaid Orders",
      doc: order,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.refund = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: "Only admin can process order refunds.",
      });
    }

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
        message: "Failed to process refund!",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Refund processed successfully",
    });
  } catch (err) {
    console.error("Refund error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

