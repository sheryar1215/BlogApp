const Parse = require("parse/node");

async function createAdminRole(req, res, next) {
  try {
    const userId = req.user.id;

    if (typeof userId !== "string") {
      return res.status(400).json({ error: "Invalid user ID" });
    }
   
    
    const User = Parse.Object.extend("_User");
    const userQuery = new Parse.Query(User);
    userQuery.include("roleId");
    const user = await userQuery.get(userId, { useMasterKey: true });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    
    const roleObj = user.get("roleId");
    const userRole = roleObj ? roleObj.get("name") : "user";
    
    if (userRole !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin privileges required" });
    }
   
    next();
  } catch (error) {
    console.error("Admin check error:", error);
    return res.status(500).json({ error: "Server error while verifying admin role" });
  }
}

module.exports = { createAdminRole };