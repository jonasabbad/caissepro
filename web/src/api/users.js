import { http } from './http';

export const usersApi = {
  async getAll() {
    const { data } = await http.get('/users');
    return data.data.users;
  },
  async getById(id) {
    const { data } = await http.get(`/users/${id}`);
    return data.data.user;
  },
  async create(payload) {
    const { data } = await http.post('/users', payload);
    return data.data.user;
  },
  async update(id, payload) {
    const { data } = await http.put(`/users/${id}`, payload);
    return data.data.user;
  },
  async delete(id) {
    await http.delete(`/users/${id}`);
  },
};
