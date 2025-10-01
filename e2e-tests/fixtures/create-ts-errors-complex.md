Tests delete-rename-write order
<spawn-delete path="src/main.tsx">
</spawn-delete>
<spawn-rename from="src/App.tsx" to="src/main.tsx">
</spawn-rename>
<spawn-write path="src/main.tsx" description="final main.tsx file.">
finalMainTsxFileWithError();
</spawn-write>
EOM
