import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://iptv-manager-production.up.railway.app',
  headers: {
    'x-api-key': import.meta.env.VITE_API_KEY || 'UMIHDKEVdzPbqiOg0CZNwyh49lBa3WveLAxYfnkm1jFuRco6',
  },
})

export default api