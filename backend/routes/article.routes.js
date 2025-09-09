// Updated article routes (article.routes.js)

const express = require("express");
const router = express.Router();
const { authenticateJWT } = require("../middlewares/jwtMiddleware");
const upload = require("../config/multer");

const {
  createArticle,
  getMyArticles,
  updateArticle,
  deleteArticle,
  getAllArticles,
  getArticleStats,
  getNotifications,
  markNotificationAsRead
} = require("../controller/article.controller");

router.post("/create-article", authenticateJWT, upload.single("image"), createArticle);
router.get("/get-my-article", authenticateJWT, getMyArticles);
router.put("/update-article/:id", authenticateJWT, upload.single("image"), updateArticle);
router.delete("/delete-article/:id", authenticateJWT, deleteArticle);
router.get("/all", getAllArticles);

router.get("/stats", authenticateJWT, getArticleStats);
router.get("/notifications", authenticateJWT, getNotifications);
router.put("/notifications/:id/read", authenticateJWT, markNotificationAsRead);

module.exports = router;