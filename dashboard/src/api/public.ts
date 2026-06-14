import axios from 'axios';

/** 公开接口客户端:不带鉴权头,用于免登首页与公开详情页。 */
const publicApi = axios.create({
  baseURL: '/api/public',
});

export interface PublicServer {
  id: string;
  name: string;
  group: string;
  status: 'online' | 'warning' | 'offline' | 'empty';
  uptime: number | null;
  timeline: Array<{ status: string; start: string; end: string }>;
}

export interface PublicServerDetail {
  id: string;
  name: string;
  group: string;
  status: 'online' | 'warning' | 'offline' | 'empty';
  since: string;
  until: string;
  timeline: Array<{ status: string; start: string; end: string }>;
  uptime: { day: number | null; week: number | null; month: number | null };
}

export async function fetchPublicStatus(hours = 24): Promise<PublicServer[]> {
  const { data } = await publicApi.get('/status', { params: { hours } });
  return data;
}

export async function fetchPublicServer(id: string, hours = 24): Promise<PublicServerDetail> {
  const { data } = await publicApi.get(`/status/${id}`, { params: { hours } });
  return data;
}

export default publicApi;
