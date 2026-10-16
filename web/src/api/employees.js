import { http } from './http';

export const employeesApi = {
  async getAll(params = {}) {
    const { data } = await http.get('/employees', { params: { ...(params.activeOnly && { activeOnly: 'true' }) } });
    return data.data.employees || [];
  },
  /** { employees, selfEmployeeId } for the till's seller picker. */
  async getSellable() {
    const { data } = await http.get('/employees/sellable');
    return data.data;
  },
  async getLinkableUsers() {
    const { data } = await http.get('/employees/linkable-users');
    return data.data.users || [];
  },
  async create(payload) {
    const { data } = await http.post('/employees', payload);
    return data.data.employee;
  },
  async update(id, payload) {
    const { data } = await http.put(`/employees/${id}`, payload);
    return data.data.employee;
  },
  async deactivate(id) {
    const { data } = await http.delete(`/employees/${id}`);
    return data.data.employee;
  },
  async linkUser(id, userId) {
    const { data } = await http.post(`/employees/${id}/link-user`, { userId });
    return data.data.employee;
  },
  async unlinkUser(id) {
    const { data } = await http.delete(`/employees/${id}/link-user`);
    return data.data.employee;
  },
};
