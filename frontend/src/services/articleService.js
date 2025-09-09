import API from "../api/axios";

export const getAllArticles = async () => {
  const res = await API.get("/articles/all");
  return res.data.articles || res.data;
};

export const getMyArticles = async () => {
  const res = await API.get("/articles/get-my-article");
  return res.data.articles || [];
};

export const createArticle = async (formData) => {
  const res = await API.post("/articles/create-article", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const updateArticle = async (id, formData) => {
  const res = await API.put(`/articles/update-article/${id}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const deleteArticle = async (id) => {
  const res = await API.delete(`/articles/delete-article/${id}`);
  return res.data;
};

export const getArticlesByUser = async (userId) => {
  const res = await API.get(`/admin/get-articles/${userId}`);
  return res.data.articles || [];
};


export const getArticleStats = async () => {
  try {
    const response = await API.get("/articles/stats");
    return response.data;
  } catch (error) {
    throw new Error(`Stats error: ${error.response?.data?.error || error.message}`);
  }
};

export const getNotifications = async () => {
  try {
    const response = await API.get("/articles/notifications");
    return response.data.notifications;
  } catch (error) {
    throw new Error(`Notifications error: ${error.response?.data?.error || error.message}`);
  }
};

export const markAsRead = async (id) => {
  try {
    const response = await API.put(`/articles/notifications/${id}/read`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.error || "Failed to mark as read");
  }
};