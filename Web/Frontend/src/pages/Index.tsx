import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

const Index = () => {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/projects', { replace: true });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner text="Redirecting..." />
    </div>
  );
};

export default Index;
