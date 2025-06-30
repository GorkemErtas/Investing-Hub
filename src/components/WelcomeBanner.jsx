import React, { useEffect, useState } from 'react';
import axios from 'axios';


const WelcomeBanner = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  return (
    <div className="w-full bg-blue-500 dark:bg-blue-600 text-white text-center py-4 px-2">
      <h1 className="text-lg sm:text-xl font-bold">
        Welcome {user?.firstName || "Guest"}!
      </h1>
    </div>
  );
};

export default WelcomeBanner;
