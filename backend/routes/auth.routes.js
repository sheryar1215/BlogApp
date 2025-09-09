const express = require("express");
  const router = express.Router();
  const { 
    signUp, 
    logIn, 
    updateUser, 
    deleteUser, 
    getProfile, 
    forgotPassword, 
    resetPassword 
  } = require("../controller/auth.controller");
  const { authenticateJWT } = require("../middlewares/jwtMiddleware");
  const upload = require("../config/multer");

  router.post("/signup", upload.single("profilePicture"), signUp);
  router.post("/login", logIn);
  router.put("/update", authenticateJWT, upload.single("profilePicture"), updateUser);
  router.delete("/delete", authenticateJWT, deleteUser);
  router.get('/getProfile', authenticateJWT, getProfile);

  
  router.post("/forgot-password", forgotPassword);
  router.post("/reset-password/:token", resetPassword);

  module.exports = router;