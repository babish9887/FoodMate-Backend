require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const connectmongo=require('./db')
// Create an Express app
const app = express();
app.use(cookieParser());
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
const fs = require('fs')


connectmongo();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
    express.urlencoded({
      extended: true,
    })
  )
  

// CORS configuration to allow localhost:5173
const corsOptions = {
    origin: ['http://localhost:5173','https://food-mate-v1.vercel.app'], // Adjust as needed for production
    credentials: true,
    methods: ['GET', 'POST','PUT','DELETE'],
    allowedHeaders: ['Content-Type','Authorization'],
};

// Apply CORS and Helmet middleware
app.use(cors(corsOptions));
app.use(helmet());

// Middleware to parse JSON data
app.use(bodyParser.json());


app.use('/api/auth',require('./routes/auth'))
app.use('/api/food',require('./routes/food'))
app.use('/api/order',require('./routes/order'))
app.use('/api/feedback',require('./routes/feedback'))
app.use('/api/dashboard',require('./routes/dashboard'))

// Start the server
app.listen(4000, () => {
    console.log('Server is running on http://localhost:4000');
});
