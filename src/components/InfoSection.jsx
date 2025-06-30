import React, { useState } from "react";
import axios from 'axios';

axios.defaults.baseURL = import.meta.env.VITE_API_URL;


const infoPool = [
  { title: "What is Cryptocurrency?", text: "Cryptocurrency is a type of digital or virtual currency that uses cryptography for security. Unlike traditional currencies issued by governments, cryptocurrencies operate on decentralized networks based on blockchain technology." },
  { title: "How Does Blockchain Work?", text: "Blockchain is a distributed ledger technology that records transactions across multiple computers. It ensures data integrity by making it nearly impossible to alter transaction history without altering all subsequent blocks." },
  { title: "Bitcoin: The First Cryptocurrency", text: "Bitcoin was introduced in 2009 by an anonymous person or group under the pseudonym Satoshi Nakamoto. It is the first decentralized digital currency, operating without a central authority." },
  { title: "Ethereum and Smart Contracts", text: "Ethereum is a decentralized platform that enables smart contracts—self-executing contracts with the terms of the agreement directly written into code. It was proposed by Vitalik Buterin in 2013 and launched in 2015." },
  { title: "What is a Smart Contract?", text: "A smart contract is a self-executing contract with terms written directly into code. It automatically enforces agreements without the need for intermediaries." },
  { title: "Decentralized Finance (DeFi)", text: "DeFi refers to financial services that operate on blockchain technology, eliminating the need for traditional banks. It includes lending, borrowing, and trading platforms that run without central authorities." },
  { title: "Proof of Work vs. Proof of Stake", text: "Proof of Work (PoW) and Proof of Stake (PoS) are two consensus mechanisms used by blockchains. PoW relies on miners solving complex problems, whereas PoS selects validators based on the number of coins they hold." },
  { title: "Bitcoin Mining", text: "Bitcoin mining is the process of verifying transactions and adding them to the blockchain. Miners solve cryptographic puzzles to earn newly created bitcoins as rewards." },
  { title: "What is an Altcoin?", text: "Altcoins are any cryptocurrencies other than Bitcoin. Examples include Ethereum, Cardano, and Solana. They often introduce new features or improvements over Bitcoin." },
  { title: "Stablecoins: A Bridge Between Crypto and Fiat", text: "Stablecoins are cryptocurrencies designed to maintain a stable value by being pegged to assets like the US dollar or gold. Examples include Tether (USDT) and USD Coin (USDC)." },
  { title: "NFTs: Unique Digital Assets", text: "Non-Fungible Tokens (NFTs) are unique digital assets that represent ownership of art, music, videos, and more. Unlike cryptocurrencies, NFTs cannot be exchanged on a one-to-one basis." },
  { title: "What is Web3?", text: "Web3 is the next evolution of the internet, integrating blockchain technology for decentralized applications (dApps), enabling greater user control and privacy." },
  { title: "The Role of Private and Public Keys", text: "Cryptocurrency transactions rely on a pair of cryptographic keys: a public key (like an address) and a private key (used to sign transactions securely)." },
  { title: "The Importance of Crypto Wallets", text: "A crypto wallet is a tool that allows users to store and manage their cryptocurrency securely. There are two main types: hot wallets (online) and cold wallets (offline)." },
  { title: "The Rise of Layer 2 Solutions", text: "Layer 2 solutions like the Lightning Network and Polygon help scale blockchains by processing transactions off the main chain, reducing congestion and fees." },
  { title: "What is Gas in Ethereum?", text: "Gas refers to the transaction fee paid to execute operations on the Ethereum blockchain. It ensures that computational resources are allocated fairly among users." },
  { title: "Centralized vs. Decentralized Exchanges", text: "Centralized exchanges (CEX) like Binance and Coinbase are run by companies, while decentralized exchanges (DEX) like Uniswap allow peer-to-peer trading without intermediaries." },
  { title: "The Future of Cryptocurrency", text: "Cryptocurrencies are evolving rapidly, with new innovations in blockchain technology, DeFi, and NFTs shaping the future of finance and digital ownership." },
  { title: "Regulations and Crypto", text: "Governments worldwide are implementing regulations to control cryptocurrency usage, aiming to balance innovation with security and compliance." },
  { title: "How to Stay Safe in Crypto", text: "To protect yourself, use secure wallets, enable two-factor authentication, and avoid sharing private keys. Be cautious of scams and phishing attacks." },
];

const InfoSection = () => {
  const [index, setIndex] = useState(0);

  const nextParagraph = () => {
    setIndex((prevIndex) => (prevIndex + 1) % infoPool.length);
  };

  const prevParagraph = () => {
    setIndex((prevIndex) => (prevIndex - 1 + infoPool.length) % infoPool.length);
  };

  return (
    <div className="bg-white dark:bg-gray-800 text-black dark:text-white p-4 sm:p-6 rounded-lg shadow-md mt-8 max-w-screen-md w-full mx-auto">
      <h2 className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 text-center">
        {infoPool[index].title}
      </h2>
      <p className="text-gray-700 dark:text-gray-300 mt-4 text-base sm:text-lg">
        {infoPool[index].text}
      </p>
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6">
        <button 
          onClick={prevParagraph} 
          className="w-full sm:w-auto bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-white px-4 py-2 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition"
        >
          Previous
        </button>
        <button 
          onClick={nextParagraph} 
          className="w-full sm:w-auto bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default InfoSection;
