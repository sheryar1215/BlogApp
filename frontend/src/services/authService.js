import API from "../api/axios";

export const signup = async (formData) => {
  const res = await API.post("/users/signup", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const login = async (credentials) => {
  const res = await API.post("/users/login", credentials);
  return res.data;
};

export const getProfile = async () => {
  const res = await API.get("/users/getProfile");
  return res.data;
};

export const updateProfile = async (formData) => {
  const res = await API.put("/users/update", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
};

export const deleteProfile = async () => {
  const res = await API.delete("/users/delete");
  return res.data;
};

export const forgotPassword = async (email) => {
  const res = await API.post("/users/forgot-password", { email });
  return res.data;
};

export const resetPassword = async (token, password) => {
  const res = await API.post(`/users/reset-password/${token}`, { password });
  return res.data;
};