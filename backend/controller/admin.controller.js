const Parse = require("parse/node");
const cloudinary = require("cloudinary").v2;
const transporter = require('../config/email');

exports.approveArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    const article = await query.get(id, { useMasterKey: true });

    if (!article) {
      return res.status(404).json({ error: `Article with ID ${id} not found` });
    }

    // Set article as approved
    article.set("isApproved", true);
    article.set("status", "approved"); // Ensure status is updated for consistency
    await article.save(null, { useMasterKey: true });

    // Create system notification for the author
    const Notification = Parse.Object.extend("Notification");
    const notification = new Notification();
    const author = article.get("author");
    let emailStatus = 'not attempted (no author)';

    if (!author) {
      console.warn(`No author associated with article ID: ${id}`);
      return res.status(400).json({ 
        message: "Article approved successfully, but no author found for notification",
        emailStatus: "failed: no author"
      });
    }

    // Fetch author details
    const userQuery = new Parse.Query(Parse.User);
    const authorUser = await userQuery.get(author.id, { useMasterKey: true });
    if (!authorUser) {
      console.warn(`Author user with ID ${author.id} not found`);
      return res.status(400).json({ 
        message: "Article approved successfully, but author user not found",
        emailStatus: "failed: author user not found"
      });
    }

    // Create notification
    notification.set("user", authorUser);
    notification.set("type", "article_approved");
    notification.set("message", `Your article "${article.get("title")}" has been approved.`);
    notification.set("articleId", article.id);
    notification.set("read", false);
    await notification.save(null, { useMasterKey: true });

    // Send email notification
    const authorEmail = authorUser.get("email");
    if (!authorEmail || typeof authorEmail !== 'string' || authorEmail.trim() === '') {
      console.warn(`Invalid or missing email for author ID: ${author.id}`);
      emailStatus = 'failed: invalid or missing email';
    } else {
      const articleTitle = article.get("title");
      const mailOptions = {
        from: `"Blog Platform" <${process.env.EMAIL_USER}>`,
        to: authorEmail.trim(),
        subject: 'Your Article Has Been Approved',
        html: `
          <h2>Congratulations!</h2>
          <p>Your article "<strong>${articleTitle}</strong>" has been approved by the admin.</p>
          <p>You can now view it in the approved articles section.</p>
          <p>If you have any questions, please contact <a href="mailto:${process.env.EMAIL_USER}">support</a>.</p>
          <p>Thank you for contributing!</p>
        `
      };

      try {
        // Verify transporter configuration
        await transporter.verify();
        console.log(`Email transporter verified for ${process.env.EMAIL_USER}`);

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log(`Approval email sent to ${authorEmail}: Message ID ${info.messageId}`);
        emailStatus = 'sent';
      } catch (emailErr) {
        console.error("Failed to send approval email:", {
          message: emailErr.message,
          code: emailErr.code || 'N/A',
          authorEmail,
          stack: emailErr.stack
        });
        emailStatus = `failed: ${emailErr.message}`;
      }
    }

    res.status(200).json({
      message: "Article approved successfully",
      emailStatus
    });
  } catch (err) {
    console.error("Error approving article:", {
      message: err.message,
      stack: err.stack,
      articleId: req.params.id
    });
    res.status(500).json({ error: `Failed to approve article: ${err.message}` });
  }
};

// Retain other exports from the original file
exports.getAllUsers = async (req, res) => {
  try {
    const query = new Parse.Query(Parse.User);
    query.include("roleId");
    
    const users = await query.find({ useMasterKey: true });

    const userList = await Promise.all(users.map(async (user) => {
      const Article = Parse.Object.extend("Article");
      const articleQuery = new Parse.Query(Article);
      articleQuery.equalTo("author", user);
      const articles = await articleQuery.find({ useMasterKey: true });
      
      const approvedArticles = articles.filter(a => a.get("isApproved") === true);
      const pendingArticles = articles.filter(a => a.get("isApproved") !== true);
    
      const roleObj = user.get("roleId");
      const roleName = roleObj ? roleObj.get("name") : "user";

      return {
        id: user.id,
        username: user.get("username"),
        email: user.get("email"),
        fullName: user.get("fullname"),
        profilePicture: user.get("profilePicture"),
        role: roleName, 
        articlesCount: articles.length,
        approvedArticlesCount: approvedArticles.length,
        pendingArticlesCount: pendingArticles.length,
        articles: articles.map(article => ({
          id: article.id,
          title: article.get("title"),
          content: article.get("content"),
          status: article.get("status"),
          isApproved: article.get("isApproved"),
          rejectionReason: article.get("rejectionReason") || null,
          createdAt: article.createdAt,
          updatedAt: article.updatedAt
        }))
      };
    }));

    res.status(200).json({ users: userList });
  } catch (err) {
    console.error("Error getting users:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const userQuery = new Parse.Query(Parse.User);
    const user = await userQuery.get(id, { useMasterKey: true });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const Article = Parse.Object.extend("Article"); 
    const articleQuery = new Parse.Query(Article);
    articleQuery.equalTo("author", {
      __type: "Pointer",
      className: "_User",
      objectId: id,
    });

    const articles = await articleQuery.find({ useMasterKey: true });
    if (articles.length > 0) {
      await Parse.Object.destroyAll(articles, { useMasterKey: true });
    }

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

    res.status(200).json({ message: "User and related articles deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

exports.getArticlesByUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);

    query.equalTo("author", {
      __type: "Pointer",
      className: "_User",
      objectId: userId,
    });

    query.descending("createdAt");
    const articles = await query.find({ useMasterKey: true });

    const articleList = articles.map(article => ({
      id: article.id,
      title: article.get("title"),
      content: article.get("content"),
      status: article.get("status"),
      rejectionReason: article.get("rejectionReason") || null,
      image: article.get("image"),
      createdAt: article.createdAt,
    }));

    res.status(200).json({ articles: articleList });
  } catch (err) {
    console.error("Error getting articles by user:", err);
    res.status(500).json({ error: "Failed to fetch articles" });
  }
};

exports.deleteAnyArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    const article = await query.get(id, { useMasterKey: true });

    await article.destroy({ useMasterKey: true });

    res.status(200).json({ message: "Article deleted by admin" });
  } catch (err) {
    console.error("Error deleting article:", err);
    res.status(500).json({ error: "Failed to delete article" });
  }
};

exports.updateAnyArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, status, image } = req.body || {};

    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    const article = await query.get(id, { useMasterKey: true });

    if (title) article.set("title", title);
    if (content) article.set("content", content);
    if (status) article.set("status", status);
    if (image) article.set("image", image);

    await article.save(null, { useMasterKey: true });

    res.status(200).json({ message: "Article updated successfully" });
  } catch (err) {
    console.error("Error updating article:", err);
    res.status(500).json({ error: "Failed to update article" });
  }
};

exports.getPendingArticles = async (req, res) => {
  try {
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    
    query.equalTo("isApproved", false);
    query.include("author");
    query.descending("createdAt");
    
    const articles = await query.find({ useMasterKey: true });

    const articleList = articles.map(article => {
      const author = article.get("author");
      return {
        id: article.id,
        title: article.get("title"),
        content: article.get("content"),
        status: article.get("status"),
        isApproved: article.get("isApproved"),
        rejectionReason: article.get("rejectionReason") || null,
        image: article.get("image"),
        author: author ? {
          id: author.id,
          username: author.get("username"),
          email: author.get("email")
        } : null,
        createdAt: article.createdAt,
      };
    });

    res.status(200).json({ articles: articleList });
  } catch (err) {
    console.error("Error getting pending articles:", err);
    res.status(500).json({ error: "Failed to fetch pending articles" });
  }
};

exports.getApprovedArticles = async (req, res) => {
  try {
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    
    query.equalTo("isApproved", true);
    query.include("author");
    query.descending("createdAt");
    
    const articles = await query.find({ useMasterKey: true });

    const articleList = articles.map(article => {
      const author = article.get("author");
      return {
        id: article.id,
        title: article.get("title"),
        content: article.get("content"),
        status: article.get("status"),
        isApproved: article.get("isApproved"),
        rejectionReason: article.get("rejectionReason") || null,
        image: article.get("image"),
        author: author ? {
          id: author.id,
          username: author.get("username"),
          email: author.get("email")
        } : null,
        createdAt: article.createdAt,
      };
    });

    res.status(200).json({ articles: articleList });
  } catch (err) {
    console.error("Error getting approved articles:", err);
    res.status(500).json({ error: "Failed to fetch approved articles" });
  }
};

exports.declineArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: "Reason for rejection is required" });
    }
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    const article = await query.get(id, { useMasterKey: true });

    if (!article) {
      return res.status(404).json({ error: `Article with ID ${id} not found` });
    }

    article.set("status", "rejected");
    article.set("isApproved", false);
    article.set("rejectionReason", reason);
    await article.save(null, { useMasterKey: true });

    const Notification = Parse.Object.extend("Notification");
    const notification = new Notification();
    const author = article.get("author");
    if (!author) {
      return res.status(400).json({ error: "Article has no associated author" });
    }
    notification.set("user", author);
    notification.set("type", "article_rejected");
    notification.set("message", `Your article "${article.get("title")}" was rejected. Reason: ${reason}`);
    notification.set("articleId", article.id);
    notification.set("read", false);
    await notification.save(null, { useMasterKey: true });

    res.status(200).json({ message: "Article rejected successfully" });
  } catch (err) {
    console.error("Error rejecting article:", err);
    if (err.code === 101) {
      return res.status(404).json({ error: `Article with ID ${req.params.id} not found` });
    }
    if (err.code === 137) {
      return res.status(400).json({ error: "Duplicate entry error" });
    }
    res.status(500).json({ error: `Failed to reject article: ${err.message}` });
  }
};

exports.getStatistics = async (req, res) => {
  try {
    const Article = Parse.Object.extend("Article");
    const User = Parse.Object.extend("_User");
    
    const articleQuery = new Parse.Query(Article);
    const totalArticles = await articleQuery.count({ useMasterKey: true });
    
    const pendingQuery = new Parse.Query(Article);
    pendingQuery.equalTo("isApproved", false);
    const pendingArticles = await pendingQuery.count({ useMasterKey: true });
    
    const approvedQuery = new Parse.Query(Article);
    approvedQuery.equalTo("isApproved", true);
    const approvedArticles = await approvedQuery.count({ useMasterKey: true });
    
    const userQuery = new Parse.Query(User);
    const Role = Parse.Object.extend("_Role");
    const adminRoleQuery = new Parse.Query(Role);
    adminRoleQuery.equalTo("name", "admin");
    const adminRole = await adminRoleQuery.first({ useMasterKey: true });
    
    if (adminRole) {
      userQuery.notEqualTo("roleId", adminRole);
    }
    
    const totalUsers = await userQuery.count({ useMasterKey: true });

    res.status(200).json({
      totalArticles,
      pendingArticles,
      approvedArticles,
      totalUsers
    });
  } catch (err) {
    console.error("Error getting statistics:", err);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
};