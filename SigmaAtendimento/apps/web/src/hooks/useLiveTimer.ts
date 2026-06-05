import { useState, useEffect } from 'react';

export function useLiveTimer(startedAt?: string | null, status?: 'NEW' | 'IN_PROGRESS' | 'CLOSED', totalSeconds?: number | null) {
    const [elapsed, setElapsed] = useState('');

    useEffect(() => {
        if (status === 'CLOSED' && totalSeconds !== undefined && totalSeconds !== null) {
            const h = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
            const s = (totalSeconds % 60).toString().padStart(2, '0');
            setElapsed(`${h}:${m}:${s}`);
            return;
        }

        if (status !== 'IN_PROGRESS' || !startedAt) {
            setElapsed('');
            return;
        }

        const startMs = new Date(startedAt).getTime();
        
        const updateTimer = () => {
            const now = Date.now();
            const diffSecs = Math.floor(Math.max(0, now - startMs) / 1000);
            
            const h = Math.floor(diffSecs / 3600).toString().padStart(2, '0');
            const m = Math.floor((diffSecs % 3600) / 60).toString().padStart(2, '0');
            const s = (diffSecs % 60).toString().padStart(2, '0');
            
            setElapsed(`${h}:${m}:${s}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [startedAt, status, totalSeconds]);

    return elapsed;
}
