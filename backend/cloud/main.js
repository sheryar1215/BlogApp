const Parse = require('parse/node');

Parse.Cloud.define("dummy", () => {});

Parse.Cloud.beforeSave(Parse.User, async (request) => {
  const user = request.object;

  const email = user.get("email");
  const password = user.get("password");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || !emailRegex.test(email)) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Invalid email format.");
  }

  if (!password || password.length < 6) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "Password must be at least 6 characters long.");
  }

  // Set default role to 'user' if not specified
  if (!user.get("roleId")) {
    const Role = Parse.Object.extend("_Role");
    const query = new Parse.Query(Role);
    query.equalTo("name", "user");
    const userRole = await query.first({ useMasterKey: true });
    
    if (userRole) {
      user.set("roleId", userRole);
    }
  }
});

// Add this function to get user with role name
Parse.Cloud.define("getUserWithRole", async (request) => {
  const { userId } = request.params;
  
  const User = Parse.Object.extend("_User");
  const query = new Parse.Query(User);
  query.include("roleId");
  
  const user = await query.get(userId, { useMasterKey: true });
  
  if (!user) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "User not found");
  }
  
  const role = user.get("roleId");
  const roleName = role ? role.get("name") : "user";
  
  return {
    id: user.id,
    username: user.get("username"),
    email: user.get("email"),
    fullName: user.get("fullname"),
    profilePicture: user.get("profilePicture"),
    role: roleName,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
});

Parse.Cloud.job("cleanExpiredTokens", async (request) => {
  const { status } = request;
  const PasswordResetToken = Parse.Object.extend("PasswordResetToken");
  const query = new Parse.Query(PasswordResetToken);
  query.lessThan("expiresAt", new Date());
  
  const expiredTokens = await query.find({ useMasterKey: true });
  
  if (expiredTokens.length > 0) {
    await Parse.Object.destroyAll(expiredTokens, { useMasterKey: true });
    status.message(`Cleaned up ${expiredTokens.length} expired tokens`);
  } else {
    status.message("No expired tokens to clean up");
  }
});