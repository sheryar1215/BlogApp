// schema.js - Update the CreateArticleSchema function
async function CreateArticleSchema() {
    try {
        const articleSchema = new Parse.Schema('Article');

        articleSchema
            .addString('title')
            .addString('content')
            .addFile('image')
            .addString('status', { 
                defaultValue: 'pending',
                required: true,
                options: ['draft', 'pending', 'approved', 'rejected'] // Define all possible statuses
            })
            .addBoolean('isApproved', { defaultValue: false })
            .addPointer('author', '_User');

        await articleSchema.save({ useMasterKey: true });

        console.log('Article Schema updated successfully!');
    } catch (err) {
        console.error('Error updating Article schema:', err);
    }
}

CreateArticleSchema();