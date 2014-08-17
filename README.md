Configuration
===

See config.json

Usage example
===

```bash
while ((1)); do
  currentParams=`curl http://localhost:8020/current`
  score=`doYourThing currentParams`
  curl -d '{"score":$score}' http://localhost:8020/learn
done
```
