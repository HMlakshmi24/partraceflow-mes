'use client';

import styles from './workflow.module.css';
import { Package, Zap, CheckCircle, AlertCircle } from 'lucide-react';
import { useState } from 'react';

export default function WorkflowDesignerPage() {
    const [workflowName, setWorkflowName] = useState('New Workflow');

    return (
        <div className={styles.workflowDesigner}>
            {/* Header */}
            <header className={styles.header}>
                <div className={styles.headerTitle}>
                    <Zap className={styles.headerIcon} />
                    Workflow Designer
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.headerButton}>💾 Save</button>
                    <button className={styles.headerButton}>▶️ Simulate</button>
                    <button className={styles.headerButton}>📋 Deploy</button>
                </div>
            </header>

            {/* Main Canvas Area */}
            <div className={styles.container}>
                {/* Toolbar */}
                <aside className={styles.toolbar}>
                    <h3>Components</h3>
                    <div className={styles.toolGroup}>
                        <div className={styles.toolItem} draggable>
                            <Package size={20} /> Start
                        </div>
                        <div className={styles.toolItem} draggable>
                            <Zap size={20} /> Task
                        </div>
                        <div className={styles.toolItem} draggable>
                            <CheckCircle size={20} /> Decision
                        </div>
                        <div className={styles.toolItem} draggable>
                            <AlertCircle size={20} /> End
                        </div>
                    </div>
                </aside>

                {/* Canvas */}
                <main className={styles.canvas}>
                    <div className={styles.canvasContent}>
                        <p>Drag components here to design workflow</p>
                    </div>
                </main>

                {/* Properties Panel */}
                <aside className={styles.properties}>
                    <h3>Properties</h3>
                    <div className={styles.propGroup}>
                        <label>Name</label>
                        <input
                            value={workflowName}
                            onChange={(e) => setWorkflowName(e.target.value)}
                            className={styles.propInput}
                        />
                    </div>
                    <div className={styles.propGroup}>
                        <label>Description</label>
                        <textarea className={styles.propInput} rows={4} />
                    </div>
                </aside>
            </div>
        </div>
    );
}
