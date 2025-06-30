import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;



const SelectedCoinsContext = createContext();

export const SelectedCoinsProvider = ({ children }) => {
  const [selectedCoins, setSelectedCoins] = useState([]);

  const fetchSelectedCoins = async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      try {
        const res = await axios.get(`${import.meta.env.VITE_API_URL}/settings/${user.id}`);
        if (res.data.selectedCoins) {
          setSelectedCoins(res.data.selectedCoins);
        }
      } catch (error) {
        console.error('Error fetching selected coins:', error.message);
      }
    } else {
      const guestCoins = localStorage.getItem('guest_selectedCoins');
      if (guestCoins) {
        setSelectedCoins(JSON.parse(guestCoins));
      }
    }
  };

  useEffect(() => {
    fetchSelectedCoins();
  }, []);

  const saveSelectedCoins = async (newSelectedCoins) => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      try {
        await axios.put(`${import.meta.env.VITE_API_URL}/settings/${user.id}`, { selectedCoins: newSelectedCoins });
      } catch (error) {
        if (error.response?.status === 404) {
          try {
            await axios.post(`${import.meta.env.VITE_API_URL}/settings`, {
              userId: user.id,
              theme: 'light',
              selectedCoins: newSelectedCoins,
            });
          } catch (postErr) {
            console.error('Error creating settings for coins:', postErr.message);
          }
        } else {
          console.error('Error saving selected coins:', error.message);
        }
      }
    } else {
      localStorage.setItem('guest_selectedCoins', JSON.stringify(newSelectedCoins));
    }
    setSelectedCoins(newSelectedCoins);
  };

  const toggleCoin = (coin) => {
    const updatedCoins = selectedCoins.includes(coin)
      ? selectedCoins.filter((c) => c !== coin)
      : [...selectedCoins, coin];
    saveSelectedCoins(updatedCoins);
  };

  const clearSelectedCoins = () => {
    setSelectedCoins([]);
    localStorage.removeItem('guest_selectedCoins');
  };

  return (
    <SelectedCoinsContext.Provider
      value={{
        selectedCoins,
        setSelectedCoins: saveSelectedCoins,
        toggleCoin,
        clearSelectedCoins,
      }}
    >
      {children}
    </SelectedCoinsContext.Provider>
  );
};

export const useSelectedCoins = () => useContext(SelectedCoinsContext);
