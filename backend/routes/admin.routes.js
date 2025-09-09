const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  deleteUser,
  getArticlesByUser,
  deleteAnyArticle,
  updateAnyArticle,
  getPendingArticles,
  getApprovedArticles,
  approveArticle,
  declineArticle,
  getStatistics
} = require('../controller/admin.controller');
const { authenticateJWT } = require("../middlewares/jwtMiddleware");
const { createAdminRole } = require("../middlewares/checkAdmin");

router.use(authenticateJWT);
router.use(createAdminRole);

router.get("/get-users", getAllUsers);
router.get("/statistics", getStatistics);
router.get("/pending-articles", getPendingArticles);
router.get("/approved-articles", getApprovedArticles);
router.get("/get-articles/:userId", getArticlesByUser);
router.delete("/delete-user/:id", deleteUser);
router.delete("/delete-article/:id", deleteAnyArticle);
router.put("/update-article/:id", updateAnyArticle);
router.put("/approve-article/:id", approveArticle);
router.post("/articles/:id/decline", authenticateJWT, declineArticle);

module.exports = router;