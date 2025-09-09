const jwt = require("jsonwebtoken");
const Parse = require("parse/node");
const cloudinary = require("../config/cloudinary");
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PasswordResetToken = require('../models/PasswordResetToken');
const transporter = require('../config/email');

exports.signUp = async (req, res) => {
  try {
    const { fullName, userName, email, password, role } = req.body;
    const profilePicture = req.file;

    if (!fullName || !userName || !email || !password) {
      if (profilePicture) fs.unlinkSync(profilePicture.path);
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      if (profilePicture) fs.unlinkSync(profilePicture.path);
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Validate password length
    if (password.length < 6) {
      if (profilePicture) fs.unlinkSync(profilePicture.path);
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const validRoles = ['user', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'user';

    let uploadedUrl = "";
    if (profilePicture) {
      try {
        const uploadResult = await cloudinary.uploader.upload(profilePicture.path);
        uploadedUrl = uploadResult.secure_url;
        fs.unlinkSync(profilePicture.path);
      } catch (uploadError) {
        console.error("Cloudinary upload error:", uploadError);
        fs.unlinkSync(profilePicture.path);
        return res.status(500).json({ error: "Failed to upload profile picture" });
      }
    }

    const Role = Parse.Object.extend("_Role");
    const roleQuery = new Parse.Query(Role);
    roleQuery.equalTo("name", userRole);
    const roleObj = await roleQuery.first({ useMasterKey: true });
    
    if (!roleObj) {
      if (profilePicture) fs.unlinkSync(profilePicture.path);
      return res.status(400).json({ error: "Invalid role specified" });
    }

    const user = new Parse.User();
    user.set("fullname", fullName);
    user.set("username", userName);
    user.set("email", email);
    user.set("password", password);
    user.set("roleId", roleObj); 
    if (uploadedUrl) {
      user.set("profilePicture", uploadedUrl);
    }

    await user.signUp();
    
    const token = jwt.sign(
      {
        id: user.id,
        username: user.get("username"),
        role: userRole, 
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.status(201).json({ 
      message: "User created successfully", 
      token,
      user: {
        id: user.id,
        username: user.get("username"),
        email: user.get("email"),
        role: userRole, 
        profilePicture: user.get("profilePicture"),
        fullName: user.get("fullname")
      }
    });
  } catch (error) {
    console.error("Signup Error:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: error.message });
  }
};

exports.logIn = async (req, res) => {
  try {
    const { userName, password } = req.body;
    if (!userName || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await Parse.User.logIn(userName, password);
    
    const roleId = user.get("roleId");
    let roleName = "user";
    
    if (roleId) {
      const Role = Parse.Object.extend("_Role");
      const roleQuery = new Parse.Query(Role);
      const role = await roleQuery.get(roleId.id, { useMasterKey: true });
      roleName = role.get("name");
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.get("username"),
        role: roleName, 
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ 
      token, 
      user: {
        id: user.id,
        username: user.get("username"),
        role: roleName, 
        email: user.get("email"),
        profilePicture: user.get("profilePicture"),
        fullName: user.get("fullname")
      } 
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(401).json({ error: "Invalid credentials" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(req.user.id, { useMasterKey: true });

    if (!user) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "User not found" });
    }

    const { fullName, email, username, password, role } = req.body;
    const newProfilePic = req.file;

    if (fullName) user.set("fullname", fullName);
    if (username) user.set("username", username);
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        if (newProfilePic) fs.unlinkSync(newProfilePic.path);
        return res.status(400).json({ error: "Invalid email format" });
      }
      user.set("email", email);
    }
    if (password) {
      if (password.length < 6) {
        if (newProfilePic) fs.unlinkSync(newProfilePic.path);
        return res.status(400).json({ error: "Password must be at least 6 characters long" });
      }
      user.set("password", password);
    }
    
    if (role) {
      const Role = Parse.Object.extend("_Role");
      const roleQuery = new Parse.Query(Role);
      roleQuery.equalTo("name", role);
      const roleObj = await roleQuery.first({ useMasterKey: true });
      
      if (roleObj) {
        user.set("roleId", roleObj);
      }
    }

    if (newProfilePic) {
      try {          
        const oldProfilePic = user.get("profilePicture");
        if (oldProfilePic) {
          const publicId = oldProfilePic.split('/').pop().split('.')[0];
          await cloudinary.uploader.destroy(publicId);
        }        
        const uploadResult = await cloudinary.uploader.upload(newProfilePic.path);
        user.set("profilePicture", uploadResult.secure_url);
        fs.unlinkSync(newProfilePic.path);
      } catch (uploadError) {
        console.error("Profile picture update error:", uploadError);
        fs.unlinkSync(newProfilePic.path);
        return res.status(500).json({ error: "Failed to update profile picture" });
      }
    }

    await user.save(null, { useMasterKey: true });
    
    const roleId = user.get("roleId");
    let roleName = "user";
    
    if (roleId) {
      const Role = Parse.Object.extend("_Role");
      const roleQuery = new Parse.Query(Role);
      const roleObj = await roleQuery.get(roleId.id, { useMasterKey: true });
      roleName = roleObj.get("name");
    }

    res.status(200).json({
      message: "User updated successfully",
      user: {
        id: user.id,
        username: user.get("username"),
        email: user.get("email"),
        fullname: user.get("fullname"),
        profilePicture: user.get("profilePicture"),
        role: roleName
      },
    });
  } catch (error) {
    console.error("Update Error:", error);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(req.user.id, { useMasterKey: true });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Delete associated articles
    const Article = Parse.Object.extend("Article");
    const articleQuery = new Parse.Query(Article);
    articleQuery.equalTo("author", {
      __type: "Pointer",
      className: "_User",
      objectId: req.user.id,
    });
    const articles = await articleQuery.find({ useMasterKey: true });
    if (articles.length > 0) {
      await Parse.Object.destroyAll(articles, { useMasterKey: true });
    }

    // Delete associated notifications
    const Notification = Parse.Object.extend("Notification");
    const notificationQuery = new Parse.Query(Notification);
    notificationQuery.equalTo("user", {
      __type: "Pointer",
      className: "_User",
      objectId: req.user.id,
    });
    const notifications = await notificationQuery.find({ useMasterKey: true });
    if (notifications.length > 0) {
      await Parse.Object.destroyAll(notifications, { useMasterKey: true });
    }

    // Delete profile picture
    const profilePicture = user.get("profilePicture");
    if (profilePicture) {
      try {
        const publicId = profilePicture.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(publicId);
      } catch (cloudinaryError) {
        console.error("Cloudinary delete error:", cloudinaryError);
      }
    }

    await user.destroy({ useMasterKey: true });

    res.status(200).json({ message: "User, related articles, and notifications deleted successfully" });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(400).json({ error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const userId = req.user.id; 
    const userQuery = new Parse.Query(Parse.User);
    userQuery.include("roleId");
    const user = await userQuery.get(userId, { useMasterKey: true });

    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const roleObj = user.get("roleId");
    const roleName = roleObj ? roleObj.get("name") : "user";

    res.status(200).json({
      fullName: user.get("fullname"),
      userName: user.get("username"),
      email: user.get("email"),
      role: roleName,
      profilePicture: user.get("profilePicture"),
      createdAt: user.createdAt, 
    });
  } catch (error) {
    console.error("Get Profile Error:", error.message);
    res.status(400).json({ error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    console.log("Forgot password request for:", email); 

    const userQuery = new Parse.Query(Parse.User);
    userQuery.equalTo("email", email);
    const user = await userQuery.first({ useMasterKey: true });

    if (!user) {
      console.log("User not found with email:", email); 
      return res.status(200).json({ 
        message: "If the email exists, a password reset link has been sent" 
      });
    }

    const resetToken = await PasswordResetToken.createToken(user.id);
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken.get('token')}`;

    console.log("Reset URL:", resetUrl); 

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h2>Password Reset Request</h2>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request this reset, please ignore this email.</p>
      `
    };

    console.log("Attempting to send email..."); 
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully to:", email);

    res.status(200).json({ 
      message: "If the email exists, a password reset link has been sent" 
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    console.error("Full error details:", error.message, error.stack); 
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const resetToken = await PasswordResetToken.findByToken(token);
    
    if (!resetToken) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(resetToken.get('userId'), { useMasterKey: true });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    user.set('password', password);
    await user.save(null, { useMasterKey: true });

    resetToken.set('used', true);
    await resetToken.save(null, { useMasterKey: true });

    res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};