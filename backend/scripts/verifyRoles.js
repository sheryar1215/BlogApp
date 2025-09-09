
const Parse = require('parse/node');

async function verifyAndFixRoles() {
  try {
    console.log('Verifying and fixing roles...');
    
    
    Parse.initialize(process.env.APP_ID, process.env.JAVASCRIPT_KEY, process.env.MASTER_KEY);
    Parse.serverURL = process.env.SERVER_URL;
    
    
    const User = Parse.Object.extend('_User');
    const userQuery = new Parse.Query(User);
    userQuery.include("roleId");
    const users = await userQuery.find({ useMasterKey: true });
    
    console.log(`Found ${users.length} users to verify`);
    
    
    const Role = Parse.Object.extend('_Role');
    const roleQuery = new Parse.Query(Role);
    const roles = await roleQuery.find({ useMasterKey: true });
    
    const adminRole = roles.find(r => r.get('name') === 'admin');
    const userRole = roles.find(r => r.get('name') === 'user');
    
    if (!adminRole || !userRole) {
      console.error('Required roles not found');
      return;
    }
    
    
    for (const user of users) {
      const roleObj = user.get("roleId");
      const currentRoleName = roleObj ? roleObj.get("name") : null;
      
      console.log(`User: ${user.get('username')}, Role: ${currentRoleName}`);
      
    
      if (!roleObj) {
        user.set("roleId", userRole);
        await user.save(null, { useMasterKey: true });
        console.log(`Fixed role for user: ${user.get('username')}`);
      }
    }
    
    console.log('Role verification completed successfully!');
  } catch (error) {
    console.error('Verification failed:', error);
  }
}


if (require.main === module) {
  require('dotenv').config();
  verifyAndFixRoles();
}

module.exports = verifyAndFixRoles;