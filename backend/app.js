const Parse = require('parse/node');
const express = require('express');
const { ParseServer } = require('parse-server');
const mongoose = require('mongoose');
const authRouter = require('./routes/auth.routes');
const articleRoutes = require("./routes/article.routes");
const adminRouter = require('./routes/admin.routes');
require('dotenv').config();


const app = express();


const cors = require('cors');
app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const api = new ParseServer({
  cloud: process.env.CLOUD_PATH || './cloud/main.js',
  databaseURI: process.env.MONGO_DB_URL || 'mongodb://localhost:27017/parse',
  appId: process.env.APP_ID,
  masterKey: process.env.MASTER_KEY,
  serverURL: process.env.SERVER_URL,
  allowClientClassCreation: false,
  liveQuery: {
    classNames: ['Article'],
  },
});

app.use('/users', authRouter);
app.use('/parse', api.app);
app.use("/articles", articleRoutes);
app.use('/admin', adminRouter);

const PORT = process.env.PORT || 1337;
mongoose
  .connect(process.env.MONGO_DB_URL || 'mongodb://localhost:27017/parse')
  .then(() => {
    console.log('MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });