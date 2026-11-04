import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

export interface CoursesResult {
  /** undefined while loading. */
  courses: Doc<'courses'>[] | undefined;
  createCourse: (args: { name: string }) => Promise<Id<'courses'>>;
  removeCourse: (args: { id: Id<'courses'> }) => Promise<null>;
}

/** The student's courses (A → Z) and the mutations that change them. */
export const useCourses = (): CoursesResult => {
  const courses = useQuery(api.courses.list);
  const createCourse = useMutation(api.courses.create);
  const removeCourse = useMutation(api.courses.remove);
  return { courses, createCourse, removeCourse };
};
