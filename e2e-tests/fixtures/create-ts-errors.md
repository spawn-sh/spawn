This will get a TypeScript error.

<spawn-write path="src/bad-file.ts" description="This will get a TypeScript error.">
import NonExistentClass from 'non-existent-class';

const x = new Object();
x.nonExistentMethod();
</spawn-write>

EOM
