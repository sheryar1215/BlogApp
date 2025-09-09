import API from "../api/axios";

export const getAllUsers = async () => {
  const res = await API.get("/admin/get-users");
  return res.data.users || [];
};

export const getStatistics = async () => {
  const res = await API.get("/admin/statistics");
  return res.data;
};

export const getPendingArticles = async () => {
  const res = await API.get("/admin/pending-articles");
  return res.data.articles || [];
};

export const getApprovedArticles = async () => {
  const res = await API.get("/admin/approved-articles");
  return res.data.articles || [];
};

export const approveArticle = async (id) => {
  return API.put(`/admin/approve-article/${id}`);
};

export const declineArticle = async (id, payload) => {
  try {
    console.log("Decline article payload:", { id, payload }); // Log the ID and payload
    const res = await API.post(`/admin/articles/${id}/decline`, payload);
    return res.data;
  } catch (error) {
    console.error("Error declining article:", error);
    throw error;
  }
};

export const deleteUser = async (id) => {
  const res = await API.delete(`/admin/delete-user/${id}`);
  return res.data;
};

export const deleteAnyArticle = async (id) => {
  return API.delete(`/admin/delete-article/${id}`);
};

export const updateAnyArticle = async (id, payload) => {
  return API.put(`/admin/update-article/${id}`, payload);
};