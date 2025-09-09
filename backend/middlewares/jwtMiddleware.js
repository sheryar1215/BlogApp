const jwt = require('jsonwebtoken');
const Parse = require('parse/node');

exports.authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Authorization header missing" });
  }

  const tokenParts = authHeader.split(" ");
  if (tokenParts.length !== 2 || tokenParts[0] !== "Bearer") {
    return res.status(401).json({ error: "Invalid token format" });
  }

  const token = tokenParts[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (!decoded.id) {
      return res.status(401).json({ error: "Invalid token contents" });
    }

    
    const User = Parse.Object.extend("_User");
    const userQuery = new Parse.Query(User);
    userQuery.include("roleId");
    const user = await userQuery.get(decoded.id, { useMasterKey: true });
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    
    const roleObj = user.get("roleId");
    const roleName = roleObj ? roleObj.get("name") : "user";
    
    req.user = {
      id: user.id,
      username: user.get("username"),
      role: roleName,
      email: user.get("email"),
      fullName: user.get("fullname"),
      profilePicture: user.get("profilePicture")
    };
    
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(401).json({ error: "Invalid token" });
  }
};