import { Plus } from 'lucide-react'
import { Button, Heading, Text } from '../../../design-system'

export function TodosHeader({
  disabled,
  completed,
  total,
  onCreate,
}: {
  disabled: boolean
  completed: number
  total: number
  onCreate: () => void
}) {
  return (
    <section className="row spread" aria-labelledby="page-title">
      <div className="stack compact">
        <Heading id="page-title">Tasks</Heading>
        <Text muted>Create, organize, and complete tasks.</Text>
        {total > 0 && (
          <Text size="small" className="task-progress">
            {completed} of {total} tasks completed
          </Text>
        )}
      </div>
      <Button disabled={disabled} onClick={onCreate}>
        <Plus size={18} aria-hidden="true" />
        New task
      </Button>
    </section>
  )
}
