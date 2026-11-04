import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCourses } from '@/hooks/use-courses';
import { friendlyError } from '@/lib/errors';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import type { Id } from '../../../../convex/_generated/dataModel';

/** Settings → Study: add and remove courses. A course with sessions can't be removed. */
export function CoursesSection() {
  const id = useId();
  const { courses = [], createCourse, removeCourse } = useCourses();
  const [name, setName] = useState('');

  const add = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createCourse({ name: trimmed });
      setName('');
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t add that course. Try again.'));
    }
  };

  const remove = async (courseId: Id<'courses'>) => {
    try {
      await removeCourse({ id: courseId });
    } catch (error) {
      toast.error(friendlyError(error, 'Couldn’t remove that course. Try again.'));
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-course`} className="text-sm text-foreground">
        Courses
      </Label>
      <p className="text-xs text-muted-foreground">
        Your classes. Each photographed session belongs to one.
      </p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input
          id={`${id}-course`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. PSYC 100"
          className="flex-1 bg-background border-border"
        />
        <Button type="submit" variant="secondary" size="sm">
          Add
        </Button>
      </form>
      {courses.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {courses.map((course) => (
            <span
              key={course._id}
              className="inline-flex items-center gap-1 rounded-full glass-light px-2.5 py-1 text-xs text-foreground"
            >
              {course.name}
              <button
                type="button"
                className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors"
                onClick={() => void remove(course._id)}
                aria-label={`Remove ${course.name}`}
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
