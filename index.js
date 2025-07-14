import React, { useState, useEffect } from 'react';
import axios from 'axios';
import io from 'socket.io-client';

export default function Home() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [bots, setBots] = useState([]);
  const [file, setFile] = useState(null);
  const [output, setOutput] = useState([]);
  const [socket, setSocket] = useState(null);

  const login = async () => {
    try {
      const res = await axios.post('/api/login', { username, password });
      setToken(res.data.token);
      fetchBots(res.data.token);
      const s = io({ query: { username } });
      s.on('bot-output', data => {
        setOutput(old => [...old, '[OUTPUT] ' + data.output]);
      });
      s.on('bot-error', data => {
        setOutput(old => [...old, '[ERROR] ' + data.error]);
      });
      s.on('bot-closed', data => {
        setOutput(old => [...old, `[CLOSED] Bot: ${data.bot} Code: ${data.code}`]);
      });
      setSocket(s);
    } catch (e) {
      alert('Login fallido');
    }
  };

  const fetchBots = async (token) => {
    const res = await axios.get('/api/bots', { headers: { Authorization: 'Bearer ' + token } });
    setBots(res.data.bots);
  };

  const uploadBot = async () => {
    if (!file) return alert('Selecciona un archivo');
    const formData = new FormData();
    formData.append('file', file);
    try {
      await axios.post('/api/upload', formData, { headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'multipart/form-data' } });
      fetchBots(token);
    } catch {
      alert('Error al subir archivo');
    }
  };

  const startBot = async (botPath) => {
    await axios.post('/api/start', { botPath }, { headers: { Authorization: 'Bearer ' + token } });
  };

  const stopBot = async (botPath) => {
    await axios.post('/api/stop', { botPath }, { headers: { Authorization: 'Bearer ' + token } });
  };

  return (
    <div style={{ padding: 20 }}>
      {!token ? (
        <>
          <h2>Login</h2>
          <input placeholder="Usuario" onChange={e => setUsername(e.target.value)} /><br />
          <input type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} /><br />
          <button onClick={login}>Entrar</button>
        </>
      ) : (
        <>
          <h2>Bienvenido, {username}</h2>
          <input type="file" onChange={e => setFile(e.target.files[0])} /><br />
          <button onClick={uploadBot}>Subir Bot</button>
          <h3>Mis Bots</h3>
          <ul>
            {bots.map(bot => (
              <li key={bot}>
                {bot}
                <button onClick={() => startBot(bot)}>Iniciar</button>
                <button onClick={() => stopBot(bot)}>Detener</button>
              </li>
            ))}
          </ul>
          <h3>Consola en vivo:</h3>
          <div style={{ backgroundColor: '#222', color: '#0f0', height: 200, overflowY: 'scroll', padding: 10, fontFamily: 'monospace' }}>
            {output.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </>
      )}
    </div>
  );
        }
