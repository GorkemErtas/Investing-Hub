import React, { useState, useEffect } from "react";
import boyAvatar from "../assets/images/boy_3984629.png";
import girlAvatar from "../assets/images/girl_3984664.png";
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const PortfolioCustomization = ({ portfolio, userId, onBack }) => {
  const [portfolioName, setPortfolioName] = useState(portfolio?.name || "");
  const [selectedAvatar, setSelectedAvatar] = useState(portfolio?.avatar || boyAvatar);
  const [transactions, setTransactions] = useState(portfolio?.transactions || []);
  const [isEditingTransaction, setEditingTransaction] = useState(null);
  const [isLoading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (portfolio && Object.keys(portfolio).length > 0) {
      setPortfolioName(portfolio.name);
      setSelectedAvatar(portfolio.avatar || boyAvatar);
      setTransactions(portfolio.transactions || []);
    } else {
      setPortfolioName("");
      setSelectedAvatar(boyAvatar);
      setTransactions([]);
    }
  }, [portfolio]);

  const savePortfolio = async () => {
    if (!portfolioName.trim()) {
      setMessage("Portfolio name is required.");
      return;
    }

    setLoading(true);
    const endpoint = portfolio
      ? `/portfolio/${portfolio._id}`
      : "/create-portfolio";

    const method = portfolio ? "PUT" : "POST";

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: portfolioName,
          avatar: selectedAvatar,
        }),
      });

      const result = await response.json();
      if (response.ok) {
        setMessage("Portfolio saved successfully!");
        onBack();
      } else {
        setMessage(result.message || "Error saving portfolio.");
      }
    } catch (error) {
      console.error("Error saving portfolio:", error);
      setMessage("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const addTransaction = async (transaction) => {
    try {
      const response = await fetch(`/portfolio/${portfolio._id}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transaction),
      });
      const result = await response.json();
      if (response.ok) {
        setTransactions(result.portfolio.transactions);
      } else {
        console.error("Failed to add transaction:", result.message);
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  const deleteTransaction = async (transactionId) => {
    try {
      const response = await fetch(
        `/portfolio/${portfolio._id}/transaction/${transactionId}`,
        { method: "DELETE" }
      );
      const result = await response.json();
      if (response.ok) {
        setTransactions(result.transactions);
        setMessage("Transaction deleted successfully!");
      } else {
        console.error("Failed to delete transaction:", result.message);
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  };

  const handleEditSubmit = async (editedTransaction) => {
    try {
      const response = await fetch(
        `/portfolio/${portfolio._id}/transaction/${editedTransaction._id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedTransaction),
        }
      );
      const result = await response.json();
      if (response.ok) {
        setTransactions(result.transactions);
        setEditingTransaction(null);
      } else {
        console.error("Failed to update transaction:", result.message);
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-black dark:text-white flex flex-col items-center px-4 py-10 sm:px-6">
      <button onClick={onBack} className="mb-6 bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded">
        Back
      </button>

      <div className="w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
        <h2 className="text-2xl font-bold mb-4">{portfolio ? "Edit Portfolio" : "Create Portfolio"}</h2>

        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-200 mb-2">Portfolio Name</label>
          <input
            type="text"
            value={portfolioName}
            onChange={(e) => setPortfolioName(e.target.value)}
            className="border dark:border-gray-600 rounded w-full px-3 py-2 bg-white dark:bg-gray-700 text-black dark:text-white"
            placeholder="Enter portfolio name"
          />
        </div>

        <div className="mb-4">
          <label className="block text-gray-700 dark:text-gray-200 mb-2">Select Avatar</label>
          <div className="flex space-x-4">
            <img
              src={boyAvatar}
              alt="Boy Avatar"
              className={`w-16 h-16 rounded-full cursor-pointer ${selectedAvatar === boyAvatar ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => setSelectedAvatar(boyAvatar)}
            />
            <img
              src={girlAvatar}
              alt="Girl Avatar"
              className={`w-16 h-16 rounded-full cursor-pointer ${selectedAvatar === girlAvatar ? "ring-2 ring-blue-500" : ""}`}
              onClick={() => setSelectedAvatar(girlAvatar)}
            />
          </div>
        </div>

        <button
          onClick={savePortfolio}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 w-full"
          disabled={isLoading}
        >
          {isLoading ? "Saving..." : "Save Portfolio"}
        </button>

        {message && <p className="mt-4 text-center text-green-600">{message}</p>}
      </div>

      {portfolio && (
        <div className="mt-8 w-full max-w-2xl bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <h3 className="text-xl font-bold mb-4">Transactions</h3>

          {transactions.map((transaction) => (
            <div key={transaction._id} className="border-b dark:border-gray-600 py-2 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              {isEditingTransaction?._id === transaction._id ? (
                <div className="flex flex-wrap gap-2 flex-grow">
                  <input
                    type="text"
                    value={isEditingTransaction.symbol}
                    onChange={(e) => setEditingTransaction({ ...isEditingTransaction, symbol: e.target.value })}
                    className="border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-black dark:text-white"
                  />
                  <input
                    type="number"
                    value={isEditingTransaction.quantity}
                    onChange={(e) => setEditingTransaction({ ...isEditingTransaction, quantity: +e.target.value })}
                    className="border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-black dark:text-white"
                  />
                  <input
                    type="number"
                    value={isEditingTransaction.price}
                    onChange={(e) => setEditingTransaction({ ...isEditingTransaction, price: +e.target.value })}
                    className="border dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-black dark:text-white"
                  />
                  <button
                    onClick={() => handleEditSubmit(isEditingTransaction)}
                    className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <p className="flex-1 text-sm sm:text-base">
                  {transaction.action.toUpperCase()} {transaction.quantity} {transaction.symbol} @ ${transaction.price.toFixed(2)}
                </p>
              )}

              {!isEditingTransaction && (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingTransaction(transaction)}
                    className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTransaction(transaction._id)}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PortfolioCustomization;
