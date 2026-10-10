import React from 'react';
import { createRoot } from 'react-dom/client';
import PresalesWorkspace from './components/PresalesWorkspace.jsx';
import '../css/presales.css';

const root = document.getElementById('presales-workspace');
if (root) createRoot(root).render(<PresalesWorkspace {...JSON.parse(root.dataset.props)} />);
