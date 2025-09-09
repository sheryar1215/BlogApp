
const Parse = require('parse/node');

async function migrateRoles() {
  try {
    console.log('Starting role migration...');
    
    
    Parse.initialize(process.env.APP_ID, process.env.JAVASCRIPT_KEY, process.env.MASTER_KEY);
    Parse.serverURL = process.env.SERVER_URL;
    
    
    const User = Parse.Object.extend('_User');
    const userQuery = new Parse.Query(User);
    const users = await userQuery.find({ useMasterKey: true });
    
    console.log(`Found ${users.length} users to migrate`);
    
    
    const Role = Parse.Object.extend('_Role');
    const roleQuery = new Parse.Query(Role);
    const roles = await roleQuery.find({ useMasterKey: true });
    
    let adminRole = roles.find(r => r.get('name') === 'admin');
    let userRole = roles.find(r => r.get('name') === 'user');
    
    
    if (!adminRole) {
      adminRole = new Role();
      adminRole.set('name', 'admin');
      adminRole.set('ACL', new Parse.ACL());
      await adminRole.save(null, { useMasterKey: true });
      console.log('Created admin role');
    }
    
    if (!userRole) {
      userRole = new Role();
      userRole.set('name', 'user');
      userRole.set('ACL', new Parse.ACL());
      await userRole.save(null, { useMasterKey: true });
      console.log('Created user role');
    }
    
    
    for (const user of users) {
      const currentRole = user.get("role");
      
      if (currentRole === 'admin') {
        user.set('roleId', adminRole);
      } else {
        user.set('roleId', userRole);
      }
      
      
      user.unset('role');
      
      await user.save(null, { useMasterKey: true });
      console.log(`Migrated user: ${user.get('username')}`);
    }
    
    console.log('Role migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

if (require.main === module) {
  require('dotenv').config();
  migrateRoles();
}

module.exports = migrateRoles;