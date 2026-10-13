import React from 'react';
import {createRoot} from 'react-dom/client';
import Organization from './components/organization/Organization';
import '../css/organization.css';

const el = document.getElementById('organization-app');
if (el) createRoot(el).render(<Organization endpoint={el.dataset.endpoint} links={{home:el.dataset.home,documents:el.dataset.documents,presales:el.dataset.presales}} user={el.dataset.user}/>);

import '../css/workspace-refinement.css';
import '../css/organization-workspace.css';
