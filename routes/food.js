const express = require('express');
const router = express.Router();
const Food = require('../models/Food');  
const categoryController = require('../controllers/CategoryController')
const { protect } = require('../Utils/Protect');
const { restrictTo } = require('../Utils/RestrictTo');
const { getAll,  updateOne, createOne } = require('../controllers/handlerFactory');
const Category = require('../models/Category');
const {createFood,updateFoodTemp, updateFood, deleteFood, getFoods, getRecommendedFoods} =require('../controllers/foodController')

router.get('/', (req, res) => {
  res.send("This is Food page");
});

//category
router.get('/category',getAll(Category))
router.post('/category/addcategory',
  protect,restrictTo('admin'),
  createOne(Category))
router.put('/category/updatecategory/:id',
  protect,restrictTo('admin'),
  updateOne(Category))
router.delete('/category/deletecategory/:id',
  protect,restrictTo('admin'),
  categoryController.deleteCategory)


router.get('/getfoods',getFoods)
router.post('/up', updateFoodTemp)
router.get('/adminfoods', protect, restrictTo('admin'), getAll(Food))

router.post('/createfood',
  protect,restrictTo('admin'),
  createFood)

router.put('/updatefoodavailability/:id', 
  protect,restrictTo('admin'),
  updateOne(Food))

router.put('/updateFood/:id',
  protect,restrictTo('admin'),
  updateFood)

router.delete('/deletefood/:id',
  protect,restrictTo('admin'),
  deleteFood)

router.get('/getrecommendedfoods',
  protect,
  getRecommendedFoods
)


// router.get("/predict-demand", async (req, res) => {
//   try {
//     // Step 1: Aggregate data for today’s prediction
//     const today = new Date();
//     const todayDayOfWeek = today.getDay(); // 0 = Sunday

//     const orders = await Order.aggregate([
//       { $match: { "currentStatus.status": { $ne: "Cancelled" } } },
//       { $unwind: "$items" },
//       {
//         $group: {
//           _id: "$items.itemId",
//           itemName: { $first: "$items.name" },
//           orderCount: { $sum: "$items.qty" },
//           lastOrderDate: { $max: "$createdAt" },
//         },
//       },
//     ]);

//     if (!orders.length) {
//       return res.status(404).json({ message: "No order data found" });
//     }

//     // Step 2: Prepare and run prediction per item
//     const predictions = await Promise.all(
//       orders.map((item) => {
//         const lastOrder = new Date(item.lastOrderDate);
//         const daysSinceLast = Math.floor((today - lastOrder) / (1000 * 60 * 60 * 24));

//         const features = {
//           orderCount: item.orderCount,
//           daysSinceLast: daysSinceLast,
//           dayOfWeek: todayDayOfWeek,
//         };

//         const command = `python3 ml/predict_demand.py '${JSON.stringify(features)}'`;

//         return new Promise((resolve, reject) => {
//           exec(command, (err, stdout, stderr) => {
//             if (err) {
//               console.error("Prediction error:", err.message);
//               return resolve({ itemName: item.itemName, error: true });
//             }

//             try {
//               const prediction = JSON.parse(stdout);
//               resolve({
//                 itemId: item._id,
//                 itemName: item.itemName,
//                 predictedQuantity: prediction.predictedQuantity,
//               });
//             } catch (parseErr) {
//               console.error("Parse error:", parseErr.message);
//               resolve({ itemName: item.itemName, error: true });
//             }
//           });
//         });
//       })
//     );

//     // Step 3: Send results
//     res.status(200).json({
//       success: true,
//       results: predictions.filter((p) => !p.error),
//     });
//   } catch (err) {
//     console.error("Server error:", err.message);
//     res.status(500).json({ error: "Internal server error" });
//   }
// });

module.exports = router;
