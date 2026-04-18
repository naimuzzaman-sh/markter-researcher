import { useNavigate } from 'react-router-dom';
import SetupChat from '@/components/SetupChat';

function SetupRoute() {
  const navigate = useNavigate();
  return (
    <SetupChat
      onBriefCreated={(briefId) => {
        navigate(`/briefs/${briefId}`);
      }}
    />
  );
}

export default SetupRoute;
