window.upload = {
    async uploadFile(file, userId) {
        try {
            // Check file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                return { success: false, error: 'Arquivo muito grande' };
            }
            
            // Generate unique filename
            const fileExt = file.name.split('.').pop();
            const fileName = `${userId}_${Date.now()}.${fileExt}`;
            const filePath = `uploads/${fileName}`;
            
            // Upload to Supabase Storage
            const { data, error } = await window.supabase.client.storage
                .from('message-files')
                .upload(filePath, file);
            
            if (error) throw error;
            
            // Get public URL
            const { data: { publicUrl } } = window.supabase.client.storage
                .from('message-files')
                .getPublicUrl(filePath);
            
            return { success: true, url: publicUrl };
        } catch (error) {
            console.error('Upload error:', error);
            return { success: false, error: error.message };
        }
    },
    
    async deleteFile(fileUrl) {
        try {
            const path = fileUrl.split('/').pop();
            const { error } = await window.supabase.client.storage
                .from('message-files')
                .remove([path]);
            
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Delete error:', error);
            return { success: false, error: error.message };
        }
    }
};