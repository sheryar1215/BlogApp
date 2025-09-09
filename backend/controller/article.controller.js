const cloudinary = require("../config/cloudinary");
const Parse = require("parse/node");

exports.createArticle = async (req, res) => {
  try {
    const { title, content, status } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    let imageUrl = "";

    if (req.file?.path) {
      try {
        const result = await cloudinary.uploader.upload(req.file.path);
        imageUrl = result.secure_url;
      } catch (uploadErr) {
        console.error("Cloudinary Upload Error:", uploadErr);
        return res.status(400).json({ error: "Invalid image file or upload failed" });
      }
    }

    const Article = Parse.Object.extend("Article");
    const article = new Article();

    article.set("title", title);
    article.set("content", content);
    article.set("status", status || "draft");
    article.set("image", imageUrl);
    article.set("isApproved", false); 

    if (!req.user?.id) {
      return res.status(401).json({ error: "Unauthorized: User not found in request" });
    }

    const userQuery = new Parse.Query(Parse.User);
    const authorUser = await userQuery.get(req.user.id, { useMasterKey: true });
    article.set("author", authorUser);

    await article.save(null, { useMasterKey: true });

    res.status(201).json({
      message: "Article created successfully and is pending approval",
      article,
    });

  } catch (err) {
    console.error("Create Article Error:", err);
    res.status(500).json({ error: "Server error: " + err.message });
  }
};

exports.getMyArticles = async (req, res) => {
  try {
    const query = new Parse.Query("Article");

    const userPointer = {
      __type: "Pointer",
      className: "_User",
      objectId: req.user.id,
    };

    query.equalTo("author", userPointer);
    query.descending("createdAt");

    const results = await query.find({ useMasterKey: true });

    const articles = results.map((article) => ({
      id: article.id,
      title: article.get("title"),
      content: article.get("content"),
      status: article.get("status"),
      image: article.get("image"),
      rejectionReason: article.get("rejectionReason") || null,
      isApproved: article.get("isApproved"),
      createdAt: article.createdAt,
      updatedAt: article.updatedAt
    }));

    res.status(200).json({ articles });
  } catch (err) {
    console.error("Get Articles Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.updateArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, status } = req.body;
    const newImage = req.file?.path;

    const query = new Parse.Query("Article");
    const article = await query.get(id, { useMasterKey: true });

    if (article.get("author")?.id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to update this article" });
    }

    if (title) article.set("title", title);
    if (content) article.set("content", content);
    if (status) article.set("status", status);

    if (newImage) {
      const result = await cloudinary.uploader.upload(newImage);
      article.set("image", result.secure_url);
    }

    await article.save(null, { useMasterKey: true });

    res.status(200).json({ message: "Article updated", article });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteArticle = async (req, res) => {
  try {
    const { id } = req.params;

    const query = new Parse.Query("Article");
    const article = await query.get(id, { useMasterKey: true });

    if (article.get("author")?.id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to delete this article" });
    }

    // Delete associated notifications
    const Notification = Parse.Object.extend("Notification");
    const notificationQuery = new Parse.Query(Notification);
    notificationQuery.equalTo("articleId", id);
    const notifications = await notificationQuery.find({ useMasterKey: true });
    if (notifications.length > 0) {
      await Parse.Object.destroyAll(notifications, { useMasterKey: true });
    }

    await article.destroy({ useMasterKey: true });

    res.status(200).json({ message: "Article and related notifications deleted" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(400).json({ error: err.message });
  }
};

exports.deleteAnyArticle = async (req, res) => {
  try {
    const { id } = req.params;
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    const article = await query.get(id, { useMasterKey: true });

    // Delete associated notifications
    const Notification = Parse.Object.extend("Notification");
    const notificationQuery = new Parse.Query(Notification);
    notificationQuery.equalTo("articleId", id);
    const notifications = await notificationQuery.find({ useMasterKey: true });
    if (notifications.length > 0) {
      await Parse.Object.destroyAll(notifications, { useMasterKey: true });
    }

    await article.destroy({ useMasterKey: true });

    res.status(200).json({ message: "Article and related notifications deleted by admin" });
  } catch (err) {
    console.error("Error deleting article:", err);
    res.status(500).json({ error: "Failed to delete article" });
  }
};

exports.getAllArticles = async (req, res) => {
  try {
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);

    query.equalTo("isApproved", true);
    query.include("author");
    query.descending("createdAt");

    const results = await query.find({ useMasterKey: true });

    const articles = results.map(article => {
      const author = article.get("author");

      return {
        id: article.id,
        title: article.get("title"),
        content: article.get("content"),
        imageUrl: article.get("image"),
        isApproved: article.get("isApproved"),
        author: author
          ? {
              id: author.id,
              username: author.get("username"),
            }
          : null,
        createdAt: article.createdAt,
      };
    });

    res.status(200).json({ articles });
  } catch (error) {
    console.error("Error fetching all articles:", error);
    res.status(500).json({ error: "Failed to get articles" });
  }
};

exports.getArticleStats = async (req, res) => {
  try {
    const Article = Parse.Object.extend("Article");
    const query = new Parse.Query(Article);
    
    const userPointer = {
      __type: "Pointer",
      className: "_User",
      objectId: req.user.id,
    };
    query.equalTo("author", userPointer);
    
    const articles = await query.find({ useMasterKey: true });
    
    const stats = {
      total: articles.length,
      approved: articles.filter(article => 
        article.get("status") === "approved" || article.get("isApproved") === true
      ).length,
      pending: articles.filter(article => 
        article.get("status") === "pending" || 
        (article.get("isApproved") === false && article.get("status") !== "rejected")
      ).length,
      rejected: articles.filter(article => 
        article.get("status") === "rejected"
      ).length
    };
    
    res.status(200).json(stats);
  } catch (error) {
    console.error("Get Article Stats Error:", error);
    res.status(500).json({ error: "Failed to get article statistics" });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const Notification = Parse.Object.extend("Notification");
    const query = new Parse.Query(Notification);
    
    const userPointer = {
      __type: "Pointer",
      className: "_User",
      objectId: req.user.id
    };
    
    query.equalTo("user", userPointer);
    query.descending("createdAt");
    
    const notifications = await query.find({ useMasterKey: true });

    const notificationList = notifications.map(notif => ({
      id: notif.id,
      type: notif.get("type"),
      message: notif.get("message"),
      articleId: notif.get("articleId"),
      read: notif.get("read"),
      createdAt: notif.createdAt
    }));

    res.status(200).json({ notifications: notificationList });
  } catch (err) {
    console.error("Error getting notifications:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const Notification = Parse.Object.extend("Notification");
    const query = new Parse.Query(Notification);
    const notification = await query.get(id, { useMasterKey: true });

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (notification.get("user").id !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized to update this notification" });
    }

    notification.set("read", true);
    await notification.save(null, { useMasterKey: true });

    res.status(200).json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("Error marking notification as read:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
};