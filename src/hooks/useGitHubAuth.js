import { useContext } from 'react';
import { GitHubAuthContext } from '../context/GitHubAuthContext';

export function useGitHubAuth() {
    const context = useContext(GitHubAuthContext);
    if (!context) {
        throw new Error('useGitHubAuth must be used within a GitHubAuthProvider');
    }
    return context;
}
