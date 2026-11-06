import { AppLayout } from '@/components/app-layout';
import { CaptureView } from '@/components/capture-view';
import { ExamStudyView } from '@/components/exam/exam-study-view';
import { FriendsView } from '@/components/friends/friends-view';
import { MessagesView } from '@/components/messages/messages-view';
import { StudyRoomsView } from '@/components/rooms/study-rooms-view';
import { SharedSessionView } from '@/components/shared-session-view';
import { StudyView } from '@/components/study-view';
import { ThreadsView } from '@/components/threads-view';
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: AppLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: CaptureView,
});

const studyIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study',
  component: StudyView,
});

const studySessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/study/$sessionId',
  component: StudyView,
  // ?page= opens a page from a thread: a class page's 0-based index, or a
  // source's 1-based PDF page.
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({
    page: typeof search.page === 'number' ? search.page : undefined,
  }),
});

const threadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/threads',
  component: ThreadsView,
});

const courseThreadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/threads/$courseId',
  component: ThreadsView,
});

const friendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/friends',
  component: FriendsView,
});

const messagesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages',
  component: MessagesView,
});

const conversationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/messages/$conversationId',
  component: MessagesView,
});

const roomsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms',
  component: StudyRoomsView,
});

const roomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/rooms/$roomId',
  component: StudyRoomsView,
});

const examRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exam',
  component: ExamStudyView,
});

const examRoomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/exam/$examRoomId',
  component: ExamStudyView,
});

const sharedSessionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shared/$sessionId',
  component: SharedSessionView,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  studyIndexRoute,
  studySessionRoute,
  threadsRoute,
  courseThreadsRoute,
  friendsRoute,
  messagesRoute,
  conversationRoute,
  roomsRoute,
  roomRoute,
  examRoute,
  examRoomRoute,
  sharedSessionRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
